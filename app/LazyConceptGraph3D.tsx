"use client";

import { lazy, Suspense } from "react";
import type { ConceptGraph3D } from "@/lib/custom-materials";

const Studio = lazy(() => import("./ConceptGraph3D").then(module => ({ default: module.ConceptGraph3DStudio })));
export const emptyConceptGraph3D = (): ConceptGraph3D => ({ title: "", nodes: [], edges: [], camera: { x: 4, y: 4, z: 7, zoom: 1 } });

export function ConceptGraph3DStudio(props: { graph: ConceptGraph3D; onChange?: (graph: ConceptGraph3D) => void; readOnly?: boolean }) {
  return <Suspense fallback={<p role="status">3D 개념도를 불러오는 중…</p>}><Studio {...props} /></Suspense>;
}
