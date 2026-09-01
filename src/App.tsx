import { ProbePanel } from "./app/ProbePanel";
import { SqliteProbeRepository } from "./repositories/sqlite";
import "./App.css";

const repository = new SqliteProbeRepository();

function App() {
  return <ProbePanel repository={repository} />;
}

export default App;
