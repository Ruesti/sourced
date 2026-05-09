import "../app/globals.css";

export default function App({ Component, pageProps }: { Component: React.ComponentType<object>; pageProps: object }) {
  return <Component {...pageProps} />;
}
