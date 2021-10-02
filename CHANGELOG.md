# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

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
