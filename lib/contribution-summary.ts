const materialPaths = ["memorization.items", "memorization.selections", "recall.shortCards", "recall.flashCards", "recall.quizzes", "recall.sequences", "recall.diagrams", "recall.conceptModels", "recall.conceptCanvases", "recall.conceptGraphs3D", "examples"];

export function contributionToolColumns(summary: boolean) {
  if (!summary) return "questions_json AS questionsJson, recall_json AS recallJson, custom_materials_json AS customMaterialsJson";
  const count = materialPaths.map(path => `COALESCE(json_array_length(CASE WHEN json_valid(custom_materials_json) THEN custom_materials_json ELSE '{}' END, '$.${path}'), 0)`).join(" + ");
  return `NULL AS questionsJson, NULL AS recallJson, NULL AS customMaterialsJson, 1 AS isSummary, (${count}) AS materialCount`;
}
