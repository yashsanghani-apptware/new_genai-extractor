export default {
    preset: 'ts-jest',
    testEnvironment: 'node',
    "transform": {
        "^.+\\.(js|jsx|ts|tsx)$": "babel-jest"
      },      
    extensionsToTreatAsEsm: ['.ts'],
  };
