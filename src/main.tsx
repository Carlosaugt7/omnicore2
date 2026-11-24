import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Recarrega automaticamente a página caso um chunk antigo falhe após um novo deploy
window.addEventListener("vite:preloadError", () => {
  window.location.reload();
});

createRoot(document.getElementById("root")!).render(<App />);
