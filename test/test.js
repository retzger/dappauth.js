const ethUtil = require('ethereumjs-util');
const assert = require('assert');
const DappAuth = require('..');
const ProviderMock = require('./provider-mock');
const ContractMock = require('./contract-mock');
const utils = require('./utils');

describe('dappauth', function() {
  const keyA = utils.generateRandomKey();
  const keyB = utils.generateRandomKey();
  const keyC = utils.generateRandomKey();

  const testCases = [
    {
      title: 'External wallets should be authorized signers over their address',
      isEOA: true,
      challenge: 'foo',
      challengeSign: 'foo',
      signingKeys: [keyA],
      authAddr: utils.keyToAddress(keyA),
      mockContract: {
        authorizedKey: null,
        address: null,
        errorIsValidSignature: false,
      },
      expectedAuthorizedSignerError: false,
      expectedAuthorizedSigner: true,
    },

    {
      title:
        'External wallets should NOT be authorized signers when signing the wrong challenge',
      isEOA: true,
      challenge: 'foo',
      challengeSign: 'bar',
      signingKeys: [keyA],
      authAddr: utils.keyToAddress(keyA),
      mockContract: {
        authorizedKey: ethUtil.privateToPublic(keyC),
        address: utils.keyToAddress(keyA),
        errorIsValidSignature: false,
      },
      expectedAuthorizedSignerError: false,
      expectedAuthorizedSigner: false,
    },
    {
      title:
        'External wallets should NOT be authorized signers over OTHER addresses',
      isEOA: true,
      challenge: 'foo',
      challengeSign: 'foo',
      signingKeys: [keyA],
      authAddr: utils.keyToAddress(keyB),
      mockContract: {
        authorizedKey: ethUtil.privateToPublic(keyC),
        address: utils.keyToAddress(keyB),
        errorIsValidSignature: false,
      },
      expectedAuthorizedSignerError: false,
      expectedAuthorizedSigner: false,
    },
    {
      title:
        'Smart-contract wallets with a 1-of-1 correct internal key should be authorized signers over their address',
      isEOA: false,
      challenge: 'foo',
      challengeSign: 'foo',
      signingKeys: [keyB],
      authAddr: utils.keyToAddress(keyA),
      mockContract: {
        authorizedKey: ethUtil.privateToPublic(keyB),
        address: utils.keyToAddress(keyA),
        errorIsValidSignature: false,
      },
      expectedAuthorizedSignerError: false,
      expectedAuthorizedSigner: true,
    },
    {
      title:
        'Smart-contract wallets with a 1-of-2 (multi-sig) correct internal key should be authorized signers over their address',
      isEOA: false,
      challenge: 'foo',
      challengeSign: 'foo',
      signingKeys: [keyB, keyC],
      authAddr: utils.keyToAddress(keyA),
      mockContract: {
        authorizedKey: ethUtil.privateToPublic(keyB),
        address: utils.keyToAddress(keyA),
        errorIsValidSignature: false,
      },
      expectedAuthorizedSignerError: false,
      expectedAuthorizedSigner: true,
    },

    {
      title:
        'Smart-contract wallets with a 1-of-1 incorrect internal key should NOT be authorized signers over their address',
      isEOA: false,
      challenge: 'foo',
      challengeSign: 'foo',
      signingKeys: [keyB],
      authAddr: utils.keyToAddress(keyA),
      mockContract: {
        authorizedKey: ethUtil.privateToPublic(keyC),
        address: utils.keyToAddress(keyA),
        errorIsValidSignature: false,
      },
      expectedAuthorizedSignerError: false,
      expectedAuthorizedSigner: false,
    },
    {
      title: 'isAuthorizedSigner should error when smart-contract call errors',
      isEOA: false,
      challenge: 'foo',
      challengeSign: 'foo',
      signingKeys: [keyB],
      authAddr: utils.keyToAddress(keyA),
      mockContract: {
        authorizedKey: ethUtil.privateToPublic(keyB),
        address: utils.keyToAddress(keyA),
        errorIsValidSignature: true,
      },
      expectedAuthorizedSignerError: true,
      expectedAuthorizedSigner: false,
    },
  ];

  testCases.forEach((test) =>
    it(test.title, async function() {
      const dappAuth = new DappAuth(
        new ProviderMock(new ContractMock(test.mockContract)),
      );

      const signatureFunc = test.isEOA
        ? utils.signEOAPersonalMessage
        : utils.signERC1654PersonalMessage;

      const signatures = `0x${test.signingKeys
        .map((signingKey) =>
          ethUtil.stripHexPrefix(
            signatureFunc(test.challengeSign, signingKey, test.authAddr),
          ),
        )
        .join('')}`;

      let isError = false;
      let isAuthorizedSigner = false;
      try {
        isAuthorizedSigner = await dappAuth.isAuthorizedSigner(
          test.challenge,
          signatures,
          test.authAddr,
        );
      } catch (error) {
        isError = true;
      }

      assert.equal(isError, test.expectedAuthorizedSignerError);
      assert.equal(isAuthorizedSigner, test.expectedAuthorizedSigner);
    }),
  );

  it('It should decode challenge as utf8 by default when computing EOA personal messages hash', async function() {
    const dappAuth = new DappAuth(
      new ProviderMock(
        new ContractMock({
          authorizedKey: null,
          address: null,
          errorIsValidSignature: false,
        }),
      ),
    );

    const eoaHash = dappAuth._hashEOAPersonalMessage('foo');
    assert.equal(
      `0x${eoaHash.toString('hex')}`,
      '0x76b2e96714d3b5e6eb1d1c509265430b907b44f72b2a22b06fcd4d96372b8565',
    );
  });

  // See https://github.com/MetaMask/eth-sig-util/issues/60
  it('It should decode challenge as hex if hex is detected when computing EOA personal messages hash', async function() {
    const dappAuth = new DappAuth(
      new ProviderMock(
        new ContractMock({
          authorizedKey: null,
          address: null,
          errorIsValidSignature: false,
        }),
      ),
    );

    // result if 0xffff is decoded as hex:  13a6aa3102b2d639f36804a2d7c31469618fd7a7907c658a7b2aa91a06e31e47
    // result if 0xffff is decoded as utf8: 247aefb5d2e5b17fca61f786c779f7388485460c13e51308f88b2ff84ffa6851
    const eoaHash = dappAuth._hashEOAPersonalMessage('0xffff');
    assert.equal(
      `0x${eoaHash.toString('hex')}`,
      '0x13a6aa3102b2d639f36804a2d7c31469618fd7a7907c658a7b2aa91a06e31e47',
    );
  });

  // This test is needed for 100% coverage
  it('Invalid signature should fail', async function() {
    const dappAuth = new DappAuth(
      new ProviderMock(
        new ContractMock({
          authorizedKey: null,
          address: null,
          errorIsValidSignature: false,
        }),
      ),
    );

    const signatures = '0xinvalid-signature';

    let isError = false;
    let isAuthorizedSigner = false;
    try {
      isAuthorizedSigner = await dappAuth.isAuthorizedSigner(
        'foo',
        signatures,
        utils.keyToAddress(keyA),
      );
    } catch (error) {
      isError = true;
    }

    assert.equal(isError, true);
    assert.equal(isAuthorizedSigner, false);
  });
});
