import { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { SkinPainter } from '../hooks/useSkinPainter';
import {
  buildCharacter, disposeCharacter, findSkinFace, getSkinFaces, poseWalk, setOverlayVisible,
} from '../utils/skinLayout';
import type { SkinModel, SkinPixel } from '../types';
import { SKIN_W, SKIN_H } from '../types';

interface Props {
  pixelData: Uint8ClampedArray;
  model: SkinModel;
  showOverlay: boolean;
  /** Skin pixel under the cursor, in the 2D editor or on this preview */
  hover: SkinPixel | null;
  onHover: (pixel: SkinPixel | null) => void;
  painter: SkinPainter;
}

type PaintLayer = 'base' | 'overlay';

// Arm/leg swing of the walk cycle
const WALK_ANGLE = 0.7;
const WALK_SPEED = 5;

export default function Preview3D({ pixelData, model, showOverlay, hover, onHover, painter }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    skinCtx: CanvasRenderingContext2D;
    texture: THREE.CanvasTexture;
  } | null>(null);
  const characterRef = useRef<THREE.Group | null>(null);

  // Which layer the cursor points at (and paints on) when the overlay is shown
  const [paintLayer, setPaintLayer] = useState<PaintLayer>('base');
  const [walking, setWalking] = useState(false);
  const activeLayer: PaintLayer = showOverlay ? paintLayer : 'base';

  // Latest values for the handlers and render loop registered once on mount
  const latest = useRef({ onHover, painter, activeLayer, walking });
  useEffect(() => {
    latest.current = { onHover, painter, activeLayer, walking };
  }, [onHover, painter, activeLayer, walking]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const W = mount.clientWidth || 300;
    const H = mount.clientHeight || 500;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.setClearColor(0x1a1a2e, 1);
    mount.appendChild(renderer.domElement);

    // Scene
    const scene = new THREE.Scene();

    // Lighting
    // Ambient-heavy so the preview colors stay close to the colors painted in the editor
    const ambient = new THREE.AmbientLight(0xffffff, 2.2);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);
    const dirLight2 = new THREE.DirectionalLight(0x8888ff, 0.3);
    dirLight2.position.set(-10, -10, -5);
    scene.add(dirLight2);

    // Camera
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 500);
    // Far enough back that the whole character (16 wide, 32 tall) fits, even in a narrow panel
    const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(45 / 2));
    const distance = Math.max(38 / (2 * tanHalfFov), 22 / (2 * tanHalfFov * (W / H)));
    camera.position.set(0, 16, distance);
    camera.lookAt(0, 16, 0);

    // Controls: left-drag on the model paints (see below), so the right button rotates too
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 16, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.minDistance = 10;
    controls.maxDistance = 200;
    controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
    controls.update();

    // Skin texture (64x64 canvas)
    const skinCanvas = document.createElement('canvas');
    skinCanvas.width = SKIN_W;
    skinCanvas.height = SKIN_H;
    const skinCtx = skinCanvas.getContext('2d')!;
    const texture = new THREE.CanvasTexture(skinCanvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;

    // Floor grid (subtle)
    const gridHelper = new THREE.GridHelper(30, 10, 0x333355, 0x222244);
    scene.add(gridHelper);

    // Animate
    let animId = 0;
    const animate = (time: number) => {
      animId = requestAnimationFrame(animate);
      const character = characterRef.current;
      if (character) {
        poseWalk(character, latest.current.walking ? Math.sin((time / 1000) * WALK_SPEED) * WALK_ANGLE : 0);
      }
      controls.update();
      renderer.render(scene, camera);
    };
    animId = requestAnimationFrame(animate);

    // Resize handler
    const onResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    // Which skin pixel of the active layer is under the cursor
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const canvas = renderer.domElement;
    const pick = (e: PointerEvent): SkinPixel | null => {
      const character = characterRef.current;
      if (!character) return null;
      const rect = canvas.getBoundingClientRect();
      pointer.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(pointer, camera);
      const wantOverlay = latest.current.activeLayer === 'overlay';
      for (const hit of raycaster.intersectObject(character, true)) {
        if (!hit.uv || Boolean(hit.object.userData.overlay) !== wantOverlay) continue;
        return {
          x: Math.min(SKIN_W - 1, Math.floor(hit.uv.x * SKIN_W)),
          y: Math.min(SKIN_H - 1, Math.floor((1 - hit.uv.y) * SKIN_H)),
        };
      }
      return null;
    };

    // Left button on the model paints; on empty space it falls through to OrbitControls
    let painting = false;
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const pixel = pick(e);
      if (!pixel) return;
      painting = true;
      controls.enabled = false;
      canvas.setPointerCapture(e.pointerId);
      latest.current.painter.begin(pixel.x, pixel.y);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (painting) {
        const pixel = pick(e);
        if (pixel) {
          latest.current.onHover(pixel);
          latest.current.painter.move(pixel.x, pixel.y, true);
        }
        return;
      }
      // Any other held button is a camera drag
      if (e.buttons !== 0) return;
      latest.current.onHover(pick(e));
    };
    const onPointerUp = () => {
      if (!painting) return;
      painting = false;
      controls.enabled = true;
      latest.current.painter.end();
    };
    const onPointerLeave = () => latest.current.onHover(null);
    // Capture phase: must run before OrbitControls' own pointerdown listener
    canvas.addEventListener('pointerdown', onPointerDown, true);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerLeave);

    sceneRef.current = { scene, skinCtx, texture };

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown, true);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      controls.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      sceneRef.current = null;
    };
  }, []);

  // (Re)build the character when the arm width changes
  useEffect(() => {
    const ref = sceneRef.current;
    if (!ref) return;
    const { scene, texture } = ref;

    // Feet on y=0, head top at y=32
    const character = buildCharacter(texture, model);
    character.position.y = 6;
    setOverlayVisible(character, showOverlay);
    scene.add(character);
    characterRef.current = character;

    return () => {
      scene.remove(character);
      disposeCharacter(character);
      characterRef.current = null;
    };
  }, [model, showOverlay]);

  // Update texture whenever pixelData or the hovered pixel changes
  useEffect(() => {
    const ref = sceneRef.current;
    if (!ref) return;
    const { skinCtx, texture } = ref;

    const imageData = new ImageData(new Uint8ClampedArray(pixelData), SKIN_W, SKIN_H);
    skinCtx.putImageData(imageData, 0, 0);

    // Light up the hovered face, and mark the hovered pixel itself
    if (hover) {
      const face = findSkinFace(getSkinFaces(model), hover.x, hover.y);
      if (face) {
        skinCtx.fillStyle = 'rgba(255,255,255,0.3)';
        skinCtx.fillRect(face.x, face.y, face.w, face.h);
      }
      skinCtx.fillStyle = '#ffff00';
      skinCtx.fillRect(hover.x, hover.y, 1, 1);
    }

    texture.needsUpdate = true;
  }, [pixelData, hover, model]);

  return (
    <div className="preview3d-container">
      <div className="preview3d-label">3D プレビュー</div>
      <div className="preview3d-controls">
        <div className="preview3d-segment" title="3Dモデル上で指す／描くレイヤー">
          <button
            className={activeLayer === 'base' ? 'active' : ''}
            onClick={() => setPaintLayer('base')}
          >
            ベース
          </button>
          <button
            className={activeLayer === 'overlay' ? 'active' : ''}
            onClick={() => setPaintLayer('overlay')}
            disabled={!showOverlay}
          >
            重ね着
          </button>
        </div>
        <button
          className={`preview3d-toggle ${walking ? 'active' : ''}`}
          onClick={() => setWalking(v => !v)}
          title="歩行アニメーション"
        >
          {walking ? '⏸ 停止' : '▶ 歩行'}
        </button>
      </div>
      <div ref={mountRef} className="preview3d-mount" />
      <div className="preview3d-hint">モデルをドラッグ: 描画 / 余白か右ドラッグ: 回転 / ホイール: ズーム</div>
    </div>
  );
}
