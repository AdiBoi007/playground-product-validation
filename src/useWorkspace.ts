import { useEffect, useState } from "react";
interface WorkspaceSettings {
  name: string;
  workspace: string;
  reducedMotion: boolean;
}
const defaults: WorkspaceSettings = {
  name: "Alex Morgan",
  workspace: "Playground",
  reducedMotion: false,
};
export function readWorkspace(): WorkspaceSettings {
  try {
    const value = JSON.parse(
      localStorage.getItem("playground-settings") ?? "{}",
    );
    return {
      name:
        typeof value.name === "string" && value.name.trim()
          ? value.name
          : defaults.name,
      workspace:
        typeof value.workspace === "string" && value.workspace.trim()
          ? value.workspace
          : defaults.workspace,
      reducedMotion: Boolean(value.reducedMotion),
    };
  } catch {
    return defaults;
  }
}
export function useWorkspace() {
  const [settings, setSettings] = useState(readWorkspace);
  useEffect(() => {
    const update = () => setSettings(readWorkspace());
    window.addEventListener("playground-settings-updated", update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener("playground-settings-updated", update);
      window.removeEventListener("storage", update);
    };
  }, []);
  return settings;
}
