import dynamic from "next/dynamic";

const SourcedApp = dynamic(() => import("../components/SourcedApp"), { ssr: false });

export default function Home() {
  return <SourcedApp />;
}
