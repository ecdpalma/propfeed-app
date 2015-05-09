var Q = require('q');
var xml2js = require('xml2js');
var parser = new xml2js.Parser({ explicitArray: false, trim: true, normalize: true });
var moment = require('moment');
var util = require('util')

var proposicaoFactoryBuilder = function(db) {
    var Proposicao = require('./proposicao')(db);
    return {
        fromCamaraXml: function(xmlText, callback) {
            var deferred = Q.defer();
            parser.parseString(xmlText.replace(/[\n\r]/g, ''),
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
                        if (Array.isArray(result.proposicoes.proposicao)) {
                            xmlObjects = result.proposicoes.proposicao;
                        }
                        else {
                            xmlObjects = [result.proposicoes.proposicao];
                        }

                        var proposicoes = xmlObjects.map(function(xmlObject) {
                            var proposicao = new Proposicao();
                            proposicao.data = xmlObject;
                            proposicao._id = "C" + xmlObject.id;
                            proposicao.date = moment(xmlObject.datApresentacao, "DD/MM/YYYY HH:mm:ss")
                                .utcOffset("-0300")
                                .format();

                            return proposicao;
                        });

                        deferred.resolve({ proposicoes: proposicoes });
                    }
                });

            return deferred.promise;
        },

        /**
         * Converts an XML to an object, removing all LF,CR sequence
         * @param xmlText
         * @param callback function that receives the result object or null in case of error
         */
        fromSenadoXml: function(xmlText, callback) {
            var deferred = Q.defer();
            parser.parseString(xmlText,
                function(error, result) {
                    if (typeof error !== 'undefined' && error !== null) {
                        console.log("Could not parse XML: " + error);
                        deferred.reject({ message: 'parse_error'});
                    }
                    else {
                        var xmlObject;
                        /*
                         * xml2js (parser) returns an object if the XML has only one item,
                         * thus we wrap the single object in an Array.
                         */
                            xmlObject = result.DetalheMateria;

                            var proposicao = new Proposicao();
                            proposicao.data = xmlObject.Materia;
                            proposicao._id = "S" + xmlObject.Materia.IdentificacaoMateria.CodigoMateria;
                            proposicao.date = moment(xmlObject.Materia.DadosBasicosMateria.DataApresentacao, "YYYY-MM-DD")
                                .utcOffset("-0300")
                                .format();


                        deferred.resolve({ proposicao: proposicao });


                    }
                });

            return deferred.promise;
        }

    }
}

module.exports = proposicaoFactoryBuilder;
