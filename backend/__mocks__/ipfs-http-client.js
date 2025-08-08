module.exports = {
  create: () => ({
    id: async () => ({ id: 'test-node' }),
    add: async (content) => ({ cid: { toString: () => 'testcid' } }),
    pin: {
      add: async () => {},
      ls: async function* () { yield { cid: { toString: () => 'testcid' } }; },
      rm: async () => {},
    },
  }),
};
