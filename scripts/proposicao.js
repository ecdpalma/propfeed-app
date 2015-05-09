var Q = require('q');
var camara = require('./camara')();
var senado = require('./senado')();
var moment = require('moment');
var _ = require('lodash');

module.exports = function(db) {

    function Proposicao() {

    };


    Proposicao.prototype.exist = function(callback) {
        db.head(this._id, function(error, _, header) {
            if ((typeof error === 'undefined' || error === null) &&
                typeof header !== 'undefined' && header !== null && header.statusCode == 200) {
                callback(true);
            }
            else {
                callback(false);
            }
        });

    };

    Proposicao.prototype.insert = function(callback) {
        var self = this;
        self.exist(function(exist) {
            if (exist) {
                callback({
                    message: "conflict"
                }, self);
            }
            else {
                // Convert datApresentacao to a sortable format
                db.insert(self, self._id,
                    function(error, body, header) {
                        if (typeof error !== 'undefined' && error !== null) {
                            callback(error, self);
                        }
                        else {
                            callback(null, self);
                        }
                    });
            }
        });
    };

    Proposicao.archive = function(proposicoes) {
        return Q.allSettled(proposicoes.map(function(proposicao) {
            proposicao.archive();
        }));

    };

    Proposicao.prototype.archive = function() {
        var deferred = Q.defer();
        var self = this;
        db.updateWithHandler("propfeed-app", "archive", self._id, null,
            function(error, body) {
                if ((typeof error === 'undefined' || error === null) &&
                    typeof body !== 'undefined' && body !== null && body === "Archived") {
                    deferred.resolve({ status: body, proposicao: self });
                }
                else {
                    deferred.reject({ error: error, proposicao: self });
                }
            });

        return deferred.promise;
    };

    Proposicao.destroy = function(proposicoes) {
        return Q.allSettled(proposicoes.map(function(proposicao) {
            return proposicao.destroy();
        }));


    };

    Proposicao.getCurrent = function(from, to) {
        var interval;
        if (typeof from !== "undefined" && from !== null &&
            typeof to !== "undefined" && to !== null) {

            interval = {
                startkey: [moment(from, "YYYYMMDD").utcOffset("-0300").year(),
                    moment(from, "YYYYMMDD").utcOffset("-0300").month() + 1,
                    moment(from, "YYYYMMDD").utcOffset("-0300").date()],
                endkey: [moment(to, "YYYYMMDD").utcOffset("-0300").year(),
                    moment(to, "YYYYMMDD").utcOffset("-0300").month() + 1,
                    moment(to, "YYYYMMDD").utcOffset("-0300").date()],
                descending: false
            }
        }

        var deferred = Q.defer();
        db.view("propfeed-app", "current", interval, function(error, body) {
            if ((typeof error === 'undefined' || error === null) &&
                typeof body !== 'undefined' && body !== null &&
                typeof body.rows !== 'undefined' && body.rows !== null) {

                var proposicoes = body.rows.map(function(row) {
                    var proposicao = _.merge(new Proposicao(), row.value);
                    return proposicao;
                })
                deferred.resolve({ proposicoes: proposicoes });
            }
            else {
                deferred.reject(null);
            }
        });

        return deferred.promise;

    };

    Proposicao.tweet = function(twitter, proposicoes) {
        proposicoes.forEach(function(proposicao) {
            proposicao.tweet(twitter).then(function(result) {
                console.log("Tweeted " + result.proposicao._id);
            }, function(error) {
                console.log("Error tweeting " + error.proposicao._id + ": " + error.error);
            });
        });
    };

    Proposicao.prototype.destroy = function() {
        var deferred = Q.defer();
        var self = this;
        db.destroy(self._id, self._rev,
            function(error, body) {
                if (typeof error === 'undefined' || error === null) {
                    deferred.resolve({ status: body, proposicao: self });
                }
                else {
                    deferred.reject({ error: error, proposicao: self });
                }
            });

        return deferred.promise;
    };

    Proposicao.prototype.tweet = function(twitter) {
        if (this._id.charAt(0) === 'C') {
            return this.tweetCamara(twitter);
        }
        else if (this._id.charAt(0) === 'S') {
            return this.tweetSenado(twitter);
        }

        throw new Error("Not a recognized proposicao");
    };

    Proposicao.prototype.tweetCamara = function(twitter) {
        var deferred = Q.defer();
        var self = this;
        camara.buildShortUrl(self).then(function(result) {
            var buildStatus = function(url, text) {
                return url + " " + text.substring(0, 139 - 1 - twitter.urlLength)
            }

            twitter.post('statuses/update', {
                status: buildStatus(result.shortUrl, result.proposicao.data.txtEmenta)
            }, function(error, data, response) {
                if (typeof error !== "undefined" && error !== null) {
                    deferred.reject({ error: error, proposicao: self });
                }
                else {
                    deferred.resolve({ proposicao: self });
                }
            });

        }, function(reason) {
            console.log("Can't build URL");
        });

        return deferred.promise;
    };

    Proposicao.prototype.tweetSenado = function(twitter) {
        var self = this;
        var deferred = Q.defer();
        senado.buildShortUrl(self).then(function(result) {
            var buildStatus = function(url, text) {
                return url + " " + text.substring(0, 139 - 1 - twitter.urlLength)
            };

            twitter.post('statuses/update', {
                status: buildStatus(result.shortUrl, result.proposicao.data.DadosBasicosMateria.EmentaMateria)
            }, function(error, data, response) {
                if (typeof error !== "undefined" && error !== null) {
                    deferred.reject({ error: error, proposicao: self });
                }
                else {
                    deferred.resolve({ proposicao: self });
                }
            });
        }, function(reason) {
            console.log("Can't build URL");
        });

        return deferred.promise;
    }
    return Proposicao;
}

