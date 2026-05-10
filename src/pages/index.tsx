import { useState, useEffect } from "react";

export default function Home() {
  const [react, setReact] = useState("nein");
  useEffect(() => { setReact("ja"); }, []);

  useEffect(() => {
    const el = document.getElementById("inline-result");
    if (el) { el.textContent = "ja"; (el as HTMLElement).style.color = "#58a6ff"; }
  }, []);

  return (
    <div style={{ background: "#0d1117", color: "#ccc", fontFamily: "monospace", fontSize: 14, padding: 32, minHeight: "100vh" }}>
      <p>Inline JS: <span id="inline-result" style={{ color: "#ff6b6b" }}>nein</span></p>
      <p>React JS: <span style={{ color: react === "ja" ? "#58a6ff" : "#ff6b6b" }}>{react}</span></p>
    </div>
  );
}
