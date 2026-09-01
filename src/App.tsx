import { RosterApp } from "./app/RosterApp";
import { SqliteRosterRepository } from "./repositories/sqlite";
import "./App.css";

const repository = new SqliteRosterRepository();

function App() {
  return <RosterApp repository={repository} />;
}

export default App;
