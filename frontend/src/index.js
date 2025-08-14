import React from "react";
import ReactDOM from "react-dom";
import CssBaseline from "@material-ui/core/CssBaseline";
import App from "./App";

import { DarkModeProvider } from "./context/DarkMode";
//import "./polyfills"; // mantenha se ainda aparece "process is not defined"

ReactDOM.render(
  <DarkModeProvider>
    <CssBaseline />
    <App />
  </DarkModeProvider>,
  document.getElementById("root")
);

//ReactDOM.render(
//	<CssBaseline>
//		<App />
//	</CssBaseline>,
//	document.getElementById("root")
//);

// ReactDOM.render(
// 	<React.StrictMode>
// 		<CssBaseline>
// 			<App />
// 		</CssBaseline>,
//   </React.StrictMode>
// 	document.getElementById("root")
// );
