import React, { createContext, useState, useContext, useMemo } from "react";
import PropTypes from "prop-types";
import { createMuiTheme, ThemeProvider as MUIThemeProvider } from "@material-ui/core/styles";
import { CssBaseline } from "@material-ui/core";

// 1) Contexto (apenas UMA declaração)
export const DarkModeContext = createContext({
  darkMode: false,
  toggleTheme: () => {},
});

// 2) Provider correto
export const DarkModeProvider = ({ children }) => {
  const [darkMode, setDarkMode] = useState(false);

  const toggleTheme = () => setDarkMode(prev => !prev);

  const theme = useMemo(
    () =>
      createMuiTheme({
        palette: {
          // MUI v4 usa "type", v5 usa "mode"
          type: darkMode ? "dark" : "light",
        },
      }),
    [darkMode]
  );

  const contextValue = useMemo(() => ({ darkMode, toggleTheme }), [darkMode]);

  return (
    <DarkModeContext.Provider value={contextValue}>
      <MUIThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </MUIThemeProvider>
    </DarkModeContext.Provider>
  );
};

DarkModeProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

// 3) Hook de conveniência (opcional)
export const useDarkMode = () => useContext(DarkModeContext);

