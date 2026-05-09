import { useState, useEffect } from "react";
import SourcedApp from "../components/SourcedApp";

export default function Home() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return <SourcedApp />;
}
