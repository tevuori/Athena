import { useWindows } from "../store/windows";
import { APP_MAP } from "../apps/registry";
import Window from "./Window";

export default function WindowLayer() {
  const windows = useWindows((s) => s.windows);

  return (
    <>
      {windows.map((win) => {
        const def = APP_MAP[win.appId];
        if (!def) return null;
        const App = def.component;
        return (
          <Window key={win.id} win={win}>
            <App win={win} />
          </Window>
        );
      })}
    </>
  );
}
