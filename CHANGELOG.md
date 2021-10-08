# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [1.3.0](https://github.com/IOfate/kucoin-ws/compare/v1.2.2...v1.3.0) (2021-10-08)


### Features

* **core:** return is connection and number of subscriptions ([9988319](https://github.com/IOfate/kucoin-ws/commit/9988319e0e547652560a65c460dde35c4d9fd6c6))


### Bug Fixes

* **core:** end queue processor on close socket and flush it ([09987cb](https://github.com/IOfate/kucoin-ws/commit/09987cbb8e8bb10cd881fa3beb1df0de72619732))
* **core:** typo connection -> connecting ([0e2fd91](https://github.com/IOfate/kucoin-ws/commit/0e2fd91d268f8f2bea987d59a5a4b99327a70247))
* **docs:** add info about get subscription number and is connecting ([8300889](https://github.com/IOfate/kucoin-ws/commit/8300889a0675f9b0b0341d861bfe25ec4dd13dc4))

### [1.2.2](https://github.com/IOfate/kucoin-ws/compare/v1.2.1...v1.2.2) (2021-10-08)


### Bug Fixes

* **core:** handle undefined ws ([1c04bfa](https://github.com/IOfate/kucoin-ws/commit/1c04bfab5a7bbb40d449fb87af815cb2f3ccebe6))

### [1.2.1](https://github.com/IOfate/kucoin-ws/compare/v1.2.0...v1.2.1) (2021-10-08)


### Bug Fixes

* **core:** handle socket not in ready state and delay subscriptions ([aafdb53](https://github.com/IOfate/kucoin-ws/commit/aafdb533b99dd3801aa0c58e0a50316f04ca4190))

## [1.2.0](https://github.com/IOfate/kucoin-ws/compare/v1.1.1...v1.2.0) (2021-10-02)


### Features

* **core:** emit list of subscriptions ([c96ba5d](https://github.com/IOfate/kucoin-ws/commit/c96ba5dcaebd9ee0a7b54f92d822f012f9fbfe27))


### Bug Fixes

* **core:** force kucoin host in headers ([af70be4](https://github.com/IOfate/kucoin-ws/commit/af70be47b30f2c7a938dd35bdb4f4181791fafae))

### [1.1.1](https://github.com/IOfate/kucoin-ws/compare/v1.1.0...v1.1.1) (2021-10-02)


### Bug Fixes

* **core:** queue calls to send for our websocket instance ([419bee6](https://github.com/IOfate/kucoin-ws/commit/419bee6f757622b0584e927804dc314dd97fc8e8))

## [1.1.0](https://github.com/IOfate/kucoin-ws/compare/v1.0.2...v1.1.0) (2021-09-23)


### Features

* **core:** add method to check if the socket is open ([f71afa0](https://github.com/IOfate/kucoin-ws/commit/f71afa02b976c900b6084ce3268b1d9de6b3145e))
* **core:** emit a reconnect event ([c2e4e75](https://github.com/IOfate/kucoin-ws/commit/c2e4e754e49f9d2752e1e3daf68d9b883e0694af))


### Bug Fixes

* **core:** restore previous subs on disconnect ([d3f7a19](https://github.com/IOfate/kucoin-ws/commit/d3f7a193f9c9dd3a7529c2cd48a803d7bde9a872))

### [1.0.2](https://github.com/IOfate/kucoin-ws/compare/v1.0.1...v1.0.2) (2021-09-15)


### Bug Fixes

* **candle:** use candle add to detect the end of a candle ([a37d089](https://github.com/IOfate/kucoin-ws/commit/a37d08995e140bcbea14d0bb993f2fb0edbb2c10))

### [1.0.1](https://github.com/IOfate/kucoin-ws/compare/v1.0.0...v1.0.1) (2021-09-05)


### Bug Fixes

* **candle:** do not emit twice the same candle ([b9089e2](https://github.com/IOfate/kucoin-ws/commit/b9089e2f69b50a06ca386cd768dbd8d94343221c))
