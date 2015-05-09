var config = require('./config')
var Q = require('q');
var httpClient = require('httpinvoke');
var GoogleUrl = require('google-url');
var moment = require('moment');
var querystring = require('querystring');

var googleUrl = new GoogleUrl({ key: config.googl.key });
var xml2js = require('xml2js');
var parser = new xml2js.Parser({ explicitArray: false, trim: true, normalize: true });

module.exports = function(db) {

    if (typeof db !== "undefined" && db !== null) {
        var propFactory = require('./proposicao_factory')(db);
    }

    return {
        fetchProposicoes: function(from, to) {
            var deferred = Q.defer();
            var self = this;
            var parameters = {};
            parameters.dataInicioApresentacao = moment(from, "YYYYMMDD", true).format("DD/MM/YYYY");
            parameters.dataFimApresentacao = moment(to, "YYYYMMDD", true).format("DD/MM/YYYY");

            console.log("Processing date from " + parameters.dataInicioApresentacao + " to " + parameters.dataFimApresentacao);
            var url = config.senado.proposicoesEndpoint + "?" + querystring.stringify(parameters);

            var senadoResponseHandler = function(response) {
                if (typeof response !== 'undefined' && response !== null) {
                    if (response.statusCode != 200) {
                        console.log("Error " + response.statusCode);
                        return;
                    }
                }
                else {
                    console.log("No response fetching Senado proposicoes");
                    return;
                }

                return self.processPesquisaXml(response.body);
            };

            var senadoErrorHandler = function(error) {
                console.log("Error fetching Senado proposicoes: " + error.message);
            };

            return httpClient(url, 'GET', config.httpHeaders).then(senadoResponseHandler, senadoErrorHandler);
        },

        processPesquisaXml:  function(xmlText) {
            var deferred = Q.defer();
            var self = this;
            var insertedProposicoes = [];
            this.pesquisaXmlToObjects(xmlText).then(function(result) {
                return Q.allSettled(result.materias.map(function(materia) {
                    return httpClient(materia.href, 'GET', config.httpHeaders).then(function(response) {
                        if (typeof response !== 'undefined' && response !== null) {
                            if (response.statusCode != 200) {
                                console.log("Error fetching materia not 200" + response.statusCode);
                                return;
                            }
                        }
                        else {
                            console.log("Error fetching materia");
                            return;
                        }

                        return self.loadXml(response.body).then(function(result) {
                            console.log("Inserted proposicao: " + result.proposicao._id);
                            insertedProposicoes.push(result.proposicao);
                        }, function(reason) {
                            console.log("Error inserting proposicao " + reason.proposicao._id + ": " + reason.message);
                        });
                    });
                }));


            }, function(reason) {
                console.log("Could not parse Senado Pesquisa XML: " + reason.message);
            }).then(function(result) {
                deferred.resolve(insertedProposicoes);
            }, function(error) {
                console.log(error);
            });

            return deferred.promise;
        },

        pesquisaXmlToObjects: function(xmlText) {
            var deferred = Q.defer();
            parser.parseString(xmlText,
                function(error, result) {
                    if (typeof error !== 'undefined' && error !== null) {
                        console.log("Could not parse XML: " + error);
                        deferred.reject({ message: 'parse_error' });
                    }
                    else {
                        var xmlObjects;
                        /*
                         * xml2js (parser) returns an object if the XML has only one item,
                         * thus we wrap the single object in an Array.
                         */

                        if (Array.isArray(result.PesquisaBasicaMateria.Materias.Materia)) {
                            xmlObjects = result.PesquisaBasicaMateria.Materias.Materia;
                        }
                        else {
                            xmlObjects = [result.PesquisaBasicaMateria.Materias.Materia];
                        }
                        deferred.resolve({ materias: xmlObjects });
                    }
                });

            return deferred.promise;

        },

        loadXml: function(xmlText) {
            return propFactory.fromSenadoXml(xmlText).then(function(result) {
                var proposicao = result.proposicao;

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


            }, function(reason) {
                console.log("Error converting XML: " + reason.message);
            });
        },

        fetchSiglas: function() {
            var deferred = Q.defer();

            httpClient.get(config.senado.subTiposEndpoint).on('complete',
                function(data, response) {
                    if (typeof response !== 'undefined' && response !== null) {
                        if (response.statusCode != 200) {
                            deferred.reject({ message: "Error fetching subtipos: " + response.statusCode })
                            return;
                        }
                    }
                    else {
                        deferred.reject({ message: "No response fetching siglas" })
                        return;
                    }

                    // No error

                    parser.parseString(response.raw,
                        function(error, result) {
                            if (typeof result.ListaSubtiposMateria === 'undefined' || result.ListaSubtiposMateria === null) {
                                deferred.reject({ message: "Error converting XML: " + result.message })
                                return;
                            }

                            var siglas = result.ListaSubtiposMateria.SubtiposMateria.SubtipoMateria.map(function(subtipo) {
                                return subtipo.SiglaMateria.trim()
                            }).filter(function(subtipo, position, self) {
                                return self.indexOf(subtipo) == position;
                            });

                            deferred.resolve({ siglas: siglas });
                        });

                });
            return deferred.promise;

        },

        buildShortUrl: function(proposicao) {
            var deferred = Q.defer();
            googleUrl.shorten("http://www.senado.leg.br/atividade/materia/detalhes.asp?p_cod_mate=" + proposicao.data.IdentificacaoMateria.CodigoMateria,
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
        }
    }
};
