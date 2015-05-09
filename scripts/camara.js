var config = require('./config')
var Q = require('q');
var httpClient = require('httpinvoke');
var moment = require('moment');
var today = moment();
var querystring = require('querystring');
var GoogleUrl = require('google-url');
var googleUrl = new GoogleUrl({ key: config.googl.key });
var xml2js = require('xml2js');
var parser = new xml2js.Parser({ explicitArray: false, trim: true, normalize: true });

module.exports = function(db) {
    if (typeof db !== "undefined" && db !== null) {
        var propFactory = require('./proposicao_factory')(db);
    }

    return {
        fetchSiglas: function() {
            var deferred = Q.defer();

            httpClient("http://www.camara.gov.br/SitCamaraWS/Proposicoes.asmx/ListarSiglasTipoProposicao",
                'GET', config.httpHeaders).then(function(response) {

                    // No error
                    parser.parseString(response.body.replace(/[\n\r]/g, ''),
                        function(error, result) {
                            if (typeof result.siglas === 'undefined' || result.siglas === null) {
                                deferred.reject({ message: "Error converting XML: " + result.message })
                                return;
                            }

                            var siglas = result.siglas.sigla.filter(function(sigla) {
                                return sigla.$.ativa == "True"
                            }).map(function(sigla) {
                                return sigla.$.tipoSigla.trim()
                            }).filter(function(sigla, position, self) {
                                return self.indexOf(sigla) == position;
                            });

                            deferred.resolve({ siglas: siglas });
                        });

                }, function(error) {
                    deferred.reject( { message: error.message });
                });
            return deferred.promise;

        },

        fetchProposicoes: function(siglas, from, to) {
            var deferred = Q.defer();
            var self = this;
            var parameters = config.camara.parameters;
            parameters.ano = moment(from, "YYYYMMDD", true).year();
            parameters.datApresentacaoIni = moment(from, "YYYYMMDD", true).format("DD/MM/YYYY");
            parameters.datApresentacaoFim = moment(to, "YYYYMMDD", true).format("DD/MM/YYYY");

            console.log("Processing date from " + parameters.datApresentacaoIni + " to " + parameters.datApresentacaoFim);
            var insertedProposicoes = [];
            Q.allSettled(siglas.map(function(sigla) {
                parameters.sigla = sigla;
                var url = config.camara.proposicoesEndpoint + querystring.stringify(parameters);

                var camaraResponseHandler = (function(url, sigla) {
                    return function(response) {
                        if (response.statusCode !== 200) {
                            console.log("Error fetching " + sigla + ": " + response.statusCode);
                            return;
                        }

                        self.loadXml(response.body).then(function(results) {
                            insertedProposicoes.push.apply(insertedProposicoes, results.map(function(result) {
                                if (result.state != 'rejected') {
                                    console.log("Inserted proposicao: " + result.value.proposicao._id);
                                    return result.value.proposicao;
                                }
                                else {
                                    console.log("Error inserting proposicao " + result.reason.proposicao._id +
                                        ": " + result.reason.message);
                                }
                            }).filter(function(proposicao) {
                                return typeof proposicao !== "undefined";
                            }));

                        });

                    }
                })(url, parameters.sigla);

                var camaraErrorHandler = (function(sigla) {
                    return function(error) {
                        console.log("Error fetching " + sigla + ": " + error.message);
                    }
                })(parameters.sigla);

                return httpClient(url, 'GET', config.httpHeaders).then(camaraResponseHandler, camaraErrorHandler);

            })).then(function() {
                deferred.resolve(insertedProposicoes);
            });

            return deferred.promise;
        },


        loadXml: function(xmlText) {
            var self = this;
            return propFactory.fromCamaraXml(xmlText).then(function(result) {
                var proposicoes = result.proposicoes;
                return Q.allSettled(proposicoes.map(function(proposicao) {
                    var deferred = Q.defer();
                    proposicao.insert(function(error, proposicao) {
                        if (typeof error !== "undefined" && error !== null) {
                            if (error.message === "conflict") {
                                deferred.reject({
                                    message: error.message,
                                    proposicao: proposicao
                                });
                            }
                            else {
                                deferred.reject({
                                    message: error.message,
                                    proposicao: proposicao
                                });
                            }
                        }
                        else {
                            deferred.resolve({
                                proposicao: proposicao
                            });
                        }
                    });

                    return deferred.promise;
                }));

            }, function(reason) {
                console.log("Error converting XML: " + reason.message);
            });
        },

        buildShortUrl: function(proposicao) {
            var deferred = Q.defer();
            googleUrl.shorten("http://www.camara.gov.br/proposicoesWeb/fichadetramitacao?idProposicao=" + proposicao.data.id,
                function(error, shortUrl) {
                    if (typeof error === "undefined" || error === null) {
                        deferred.resolve({ shortUrl: shortUrl, proposicao: proposicao });
                    }
                    else {
                        deferred.reject(null);
                    }
                }
            );

            return deferred.promise;
        },

        isSiglaBlocked: function(sigla) {
            console.log("Sigla---" + sigla + "---")
            return (["AVN", "CAC", "DIS", "EMA", "EMP", "EMC", "MCN", "OFN", "PR", "REQ", "RIC",
                    "SIT"].indexOf(sigla) !== -1);
        }
    }
}
