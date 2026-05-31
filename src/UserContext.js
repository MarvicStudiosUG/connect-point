import React, { createContext, useContext } from 'react';

const UserContext = createContext(null);

export function UserProvider({ user, children }) {
  return React.createElement(
    UserContext.Provider,
    { value: user },
    children
  );
}

export function useUser() {
  return useContext(UserContext);
}
