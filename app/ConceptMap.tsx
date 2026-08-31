"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ConceptModel, conceptShapeDefinitions } from "@/lib/custom-materials";

const pointsFor = (shape: ConceptModel["shape"]) => {
  if (shape === "tetrahedron") return [[1, 1, 1], [-1, -1, 1], [-1, 1, -1], [1, -1, -1]];
  if (shape === "square_pyramid") return [[-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0], [0, 0, 1.7]];
  return [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
};

export function ConceptMap({ model }: { model: ConceptModel }) {
  const webglCanvas = useRef<HTMLCanvasElement>(null);
  const labelCanvas = useRef<HTMLCanvasElement>(null);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    const canvas = webglCanvas.current; const labels = labelCanvas.current;
    if (!canvas || !labels) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); } catch { setSupported(false); return; }
    const definition = conceptShapeDefinitions[model.shape];
    const coordinates = pointsFor(model.shape).map(([x, y, z]) => new THREE.Vector3(x, y, z));
    const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(38, 1, .1, 100); camera.position.set(0, 0, 6); camera.lookAt(0, 0, 0);
    const group = new THREE.Group(); group.rotation.set(.42, -.55, 0); scene.add(group);
    const vertexGeometry = new THREE.SphereGeometry(.075, 20, 20); const vertexMaterial = new THREE.MeshBasicMaterial({ color: "#ef1766" });
    coordinates.forEach((point) => { const vertex = new THREE.Mesh(vertexGeometry, vertexMaterial); vertex.position.copy(point); group.add(vertex); });
    const edgeMaterial = new THREE.LineBasicMaterial({ color: "#cfe4d9", transparent: true, opacity: .94 });
    definition.edges.forEach(([from, to]) => { const geometry = new THREE.BufferGeometry().setFromPoints([coordinates[from], coordinates[to]]); group.add(new THREE.Line(geometry, edgeMaterial)); });
    const resize = () => { const rect = canvas.getBoundingClientRect(); const scale = Math.max(window.devicePixelRatio || 1, 1); renderer.setPixelRatio(scale); renderer.setSize(rect.width, rect.height, false); labels.width = Math.round(rect.width * scale); labels.height = Math.round(rect.height * scale); labels.style.width = `${rect.width}px`; labels.style.height = `${rect.height}px`; camera.aspect = rect.width / rect.height; camera.updateProjectionMatrix(); };
    const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
    let dragging = false; let lastX = 0; let lastY = 0;
    const down = (event: PointerEvent) => { dragging = true; lastX = event.clientX; lastY = event.clientY; canvas.setPointerCapture(event.pointerId); };
    const move = (event: PointerEvent) => { if (!dragging) return; group.rotation.y += (event.clientX - lastX) * .012; group.rotation.x += (event.clientY - lastY) * .012; lastX = event.clientX; lastY = event.clientY; };
    const up = () => { dragging = false; };
    canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move); canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
    let frame = 0;
    const draw = () => {
      renderer.render(scene, camera);
      const context = labels.getContext("2d"); const rect = canvas.getBoundingClientRect();
      if (context) {
        const scale = Math.max(window.devicePixelRatio || 1, 1); context.setTransform(scale, 0, 0, scale, 0, 0); context.clearRect(0, 0, rect.width, rect.height); context.font = "600 12px Pretendard, sans-serif"; context.textAlign = "center"; context.textBaseline = "middle";
        const locate = (point: THREE.Vector3) => { const projected = group.localToWorld(point.clone()).project(camera); return { x: (projected.x * .5 + .5) * rect.width, y: (-projected.y * .5 + .5) * rect.height }; };
        definition.edges.forEach(([from, to], index) => { const midpoint = coordinates[from].clone().add(coordinates[to]).multiplyScalar(.5); const pos = locate(midpoint); const label = model.edges[index]; context.fillStyle = "rgba(4, 63, 49, .88)"; const width = Math.min(context.measureText(label).width + 14, 136); context.fillRect(pos.x - width / 2, pos.y - 10, width, 20); context.fillStyle = "#fffef9"; context.fillText(label.slice(0, 22), pos.x, pos.y); });
        coordinates.forEach((point, index) => { const pos = locate(point); context.fillStyle = "#10211c"; const label = model.vertices[index]; const width = Math.min(context.measureText(label).width + 14, 150); context.fillRect(pos.x - width / 2, pos.y - 29, width, 20); context.fillStyle = "#fffef9"; context.fillText(label.slice(0, 22), pos.x, pos.y - 19); });
      }
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move); canvas.removeEventListener("pointerup", up); canvas.removeEventListener("pointercancel", up); vertexGeometry.dispose(); vertexMaterial.dispose(); edgeMaterial.dispose(); renderer.dispose(); };
  }, [model]);

  const definition = conceptShapeDefinitions[model.shape];
  if (!supported) return <ConceptMapFallback model={model} />;
  return <div className="concept-map-wrap"><div className="concept-map-heading"><span>{definition.label} · 3D 개념도</span><strong>{model.topic}</strong><small>드래그해서 돌려 보세요</small></div><div className="concept-map-stage"><canvas ref={webglCanvas} className="concept-map-webgl" aria-label={`${model.topic} 3D 개념도`} /><canvas ref={labelCanvas} className="concept-map-labels" aria-hidden="true" /></div></div>;
}

function ConceptMapFallback({ model }: { model: ConceptModel }) {
  const definition = conceptShapeDefinitions[model.shape];
  return <div className="concept-map-fallback"><strong>{model.topic} · {definition.label}</strong><p>이 기기에서는 3D 보기를 지원하지 않아 개념 관계를 목록으로 표시합니다.</p><ul>{definition.edges.map(([from, to], index) => <li key={`${from}-${to}`}><b>{model.vertices[from]}</b> — {model.edges[index]} — <b>{model.vertices[to]}</b></li>)}</ul></div>;
}
