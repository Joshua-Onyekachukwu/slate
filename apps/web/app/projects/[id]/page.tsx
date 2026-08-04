import { PROJECTS } from "../../lib/mock";
import { Workspace } from "./workspace";

const MAX_STAGE = 7;

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ stage?: string; idea?: string; mode?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const project = PROJECTS.find((p) => p.id === id);

  // Clamp ?stage to [0, MAX_STAGE]; treat empty/non-numeric as missing.
  let initialStage = project?.stage ?? 7;
  if (sp.stage && sp.stage.trim() !== "") {
    const parsedStage = Number(sp.stage);
    if (Number.isFinite(parsedStage)) {
      initialStage = Math.min(Math.max(Math.round(parsedStage), 0), MAX_STAGE);
    }
  }

  return (
    <Workspace
      key={id}
      projectId={id}
      initialStage={initialStage}
      initialIdea={sp.idea ?? ""}
      initialMode={sp.mode ?? ""}
    />
  );
}
