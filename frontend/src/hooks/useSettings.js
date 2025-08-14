// frontend/src/hooks/useSettings.js
import { useContext } from "react";
import { DarkModeContext } from "../context/DarkMode";

export default function useSettings() {
  // mantém a API esperada pelos componentes do Whaticket
  return useContext(DarkModeContext);
}

