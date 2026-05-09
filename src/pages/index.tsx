import { useState, useEffect } from "react";

export default function Home() {
  const [msg, setMsg] = useState("JS läuft nicht");
  useEffect(() => { setMsg("JS läuft ✓"); }, []);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0d1117", color: "#58a6ff", fontFamily: "monospace", fontSize: 24 }}>
      {msg}
    </div>
  );
}
