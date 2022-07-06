# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [1.7.2](https://github.com/IOfate/kucoin-ws/compare/v1.7.1...v1.7.2) (2022-07-06)


### Bug Fixes

* **core:** clear cached candles on unsubscribe ([10eef58](https://github.com/IOfate/kucoin-ws/commit/10eef5868b5b39b4603b615176ef1fe36654d786))
* **core:** re subscribe dead sockets ([e14ba59](https://github.com/IOfate/kucoin-ws/commit/e14ba593b2216df49e686897e88a6568c225c0ff))
* **event-handler:** do not lowcase symbol for candles ([5cac539](https://github.com/IOfate/kucoin-ws/commit/5cac539060d817f9d1f1f2585ed520094bb17913))
* **got:** update to latest security release ([74a8ab4](https://github.com/IOfate/kucoin-ws/commit/74a8ab4f1ccf57941b8b6ac3d4d18979e4a5ca6a))
* **ticker:** increase trigger ticker disconnected for low volume pairs ([692c461](https://github.com/IOfate/kucoin-ws/commit/692c46131228d4471c0a92d0e7adef4b08bdc727))

### [1.7.1](https://github.com/IOfate/kucoin-ws/compare/v1.7.0...v1.7.1) (2022-06-01)


### Bug Fixes

* **client:** start ping directly after the socket is opened ([49eba1c](https://github.com/IOfate/kucoin-ws/commit/49eba1c4203b672940abf56c7218d870d23a9031))
* **core:** force reconnect when no pong detected ([86caded](https://github.com/IOfate/kucoin-ws/commit/86caded2133e6c1cb030f84b6a973c6510bbb94b))

## [1.7.0](https://github.com/IOfate/kucoin-ws/compare/v1.6.1...v1.7.0) (2022-05-22)


### Features

* **core:** add a method to see subscriptions attached to a client ([e0dfb66](https://github.com/IOfate/kucoin-ws/commit/e0dfb66cf1763cdd6ff596030ba00b33841d5805))
* **core:** emit retry subscription events ([1af61b7](https://github.com/IOfate/kucoin-ws/commit/1af61b74ed55a51344617ea4f2235bb76d2684f3))


### Bug Fixes

* **client:** improve is open socket detection ([5b01706](https://github.com/IOfate/kucoin-ws/commit/5b017065b21c78b8d1ee8f3372a68f6c5b8b8dea))
* **client:** just push new subscriptions and wait for the socket to be open ([b7d0b3d](https://github.com/IOfate/kucoin-ws/commit/b7d0b3d2e18a3e781a8ef0ba06e9ead8aa9bdd75))
* **core:** make get last client sync ([5495e19](https://github.com/IOfate/kucoin-ws/commit/5495e19dc9b0998ee75c64400832e6050db90dd2))
* **core:** on error emit retry when we retry ([6a903e4](https://github.com/IOfate/kucoin-ws/commit/6a903e4d1df3ffd41ad8343d676986d7ec8b9ad6))
* **core:** reduce max subs per socket ([59be1d7](https://github.com/IOfate/kucoin-ws/commit/59be1d76c30118b2c01891202d82029267be017d))
* **core:** split sockets at 98 ([1e5d62b](https://github.com/IOfate/kucoin-ws/commit/1e5d62bd6f21b52ce8083becab75713e618ace15))
* **core:** use token to identify clients ([0018a3d](https://github.com/IOfate/kucoin-ws/commit/0018a3d84cc5d4976f3feb463a731813d908d4c9))

### [1.6.1](https://github.com/IOfate/kucoin-ws/compare/v1.6.0...v1.6.1) (2022-05-22)


### Bug Fixes

* **client:** retry when a subscription failed ([1ac069a](https://github.com/IOfate/kucoin-ws/commit/1ac069a0b13d8c9f64f847d51123e1441ff5d497))

## [1.6.0](https://github.com/IOfate/kucoin-ws/compare/v1.5.0...v1.6.0) (2022-05-20)


### Features

* **core:** add ability to subscribe/unsubscribe to a list of tickers ([6200207](https://github.com/IOfate/kucoin-ws/commit/6200207a44bf56b7e0cedc3fc94d24375ee5d564))


### Bug Fixes

* **client:** restart queue when we restart the client ([792a5c3](https://github.com/IOfate/kucoin-ws/commit/792a5c33e0e604ade1ef024ce1749f8f9bebe50a))

## [1.5.0](https://github.com/IOfate/kucoin-ws/compare/v1.4.1...v1.5.0) (2022-03-30)


### Features

* **core:** handle kucoin hard limit for sockets per client ([e4159c8](https://github.com/IOfate/kucoin-ws/commit/e4159c8d1e906efdf2f472c3aa430896298f99cc))


### Bug Fixes

* **core:** add a map to centralize our events ([77f816c](https://github.com/IOfate/kucoin-ws/commit/77f816cc8c75400c7f0267210c77c5f5db73d747))
* **core:** use get last client when we call connect ([fdec646](https://github.com/IOfate/kucoin-ws/commit/fdec646f36b6cceec243cc54bcf7f1626051a6b8))
* **doc:** remove broken deps badges ([c1fd3cd](https://github.com/IOfate/kucoin-ws/commit/c1fd3cd1ca1300ca5799a8c99aacfc7e6844bd0d))

### [1.4.1](https://github.com/IOfate/kucoin-ws/compare/v1.4.0...v1.4.1) (2022-03-29)


### Bug Fixes

* **core:** wait for ack before sending the request ([9c74100](https://github.com/IOfate/kucoin-ws/commit/9c7410091d71914d86f22ddc84ab436535281248))

## [1.4.0](https://github.com/IOfate/kucoin-ws/compare/v1.3.0...v1.4.0) (2022-03-09)


### Features

* **core:** add event handler to process message and wait for specifics ([49c1dd3](https://github.com/IOfate/kucoin-ws/commit/49c1dd361fb55f7c51cb724e6affeab717cb810c))


### Bug Fixes

* **core:** be sure to receive a ack when we sub or unsub ([bd1fa1f](https://github.com/IOfate/kucoin-ws/commit/bd1fa1f10f8adcde2e0f524beea9294501446533))
* **core:** retry later when ws is not ready ([9402ce2](https://github.com/IOfate/kucoin-ws/commit/9402ce267115e19461c684dc4aecf2d4554a96bf))
* **core:** throw error when no welcome received ([67f0e48](https://github.com/IOfate/kucoin-ws/commit/67f0e480a6154ad118a66ea0871a5cbd28356477))
* **docs:** add info about general events ([b7e800c](https://github.com/IOfate/kucoin-ws/commit/b7e800c52bdd032bf41c99a0379c70955eefa929))
* **docs:** add more information about socket not ready ([4438d2c](https://github.com/IOfate/kucoin-ws/commit/4438d2cac8b7d1ca1d4f8625d4353a3ea071c86e))

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
