import { useState, useEffect, Component } from "react";

class ErrorBoundary extends Component<{ children: any }, { error: string | null }> {
  constructor(props: any) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e: any) { return { error: String(e) }; }
  render() {
    if (this.state.error) return (
      <div style={{ padding: 32, background: "#1a0000", color: "#ff6b6b", fontFamily: "monospace", fontSize: 13, whiteSpace: "pre-wrap" }}>
        <strong>React Fehler:</strong>{"\n"}{this.state.error}
      </div>
    );
    return this.props.children;
  }
}

export default function Home() {
  const [status, setStatus] = useState("server");
  const [App, setApp] = useState<any>(null);

  useEffect(() => {
    setStatus("mounting");
    (window as any).onerror = (msg: any, src: any, line: any) => {
      setStatus("JS-Fehler: " + msg + " @ " + src + ":" + line);
    };
    import("../components/SourcedApp")
      .then(mod => { setApp(() => mod.default); setStatus("ready"); })
      .catch(err => { setStatus("Import-Fehler: " + String(err)); });
  }, []);

  if (App && status === "ready") return <ErrorBoundary><App /></ErrorBoundary>;

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0d1117", color: status.includes("Fehler") ? "#ff6b6b" : "#58a6ff", fontFamily: "monospace", fontSize: 13, padding: 32, whiteSpace: "pre-wrap", textAlign: "center" }}>
      {status}
    </div>
  );
}
