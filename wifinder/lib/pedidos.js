/* global module */

require('colors');
var r = require('rethinkdb');
var debug = require('debug')('r');
var Worker = require('workerjs');
_ = require("underscore");

var connectdb = require("./ConnectDb");

var self = this;
var liveActives = {};

//************************************* Page DashBoard *************************************
/**
 * Devolvee um objecto com a quantidade de dispositivos encontrados no site selecionado
 * @param {type} req
 * @param {type} res
 * @returns {undefined}
 */
module.exports.getNumDispositivos = function (req, res) {
  r.connect(self.dbData).then(function (conn) {
    return r.db(self.getDataBase(req.params.id)).table("ActiveAnt").count().do(function (val) {
      return {"sensor": val,
        "moveis": r.db(self.getDataBase(req.params.id)).table("DispMoveis").count(),
        "ap": r.db(self.getDataBase(req.params.id)).table("DispAp").count()};
    }).run(conn)
        .finally(function () {
          conn.close();
        });
  }).then(function (result) {
    res.send(result);
  }).error(function (err) {
    console.log("ERROR: %s:%s", err.name, err.msg);
  });
};

/**
 * Devolve o sensor com o numero dos varios dispositivos encontrados
 * @param {type} req
 * @param {type} res
 * @returns {undefined}
 */
module.exports.getAllSensorAndisp = function (req, res) {
  r.connect(self.dbData).then(function (conn) {
    return r.db(self.getDataBase(req.params.sock)).table('AntAp').map(function (row) {
      return [{
          "nome": row("nomeAntena"),
          "count": row("host").count()
        }];
    }).map(function (row2) {
      return {
        "AP": row2.nth(0),
        "DISP": {
          "nome": row2("nome").nth(0),
          "count": r.db(self.getDataBase(req.params.sock)).table('AntDisp').filter({
            "nomeAntena": row2("nome").nth(0)})("host").nth(0).count().default(0)
        }
      };
    }).coerceTo('array').run(conn)
        .finally(function () {
          conn.close();
        });
  }).then(function (result) {
    res.send(result);
  }).error(function (err) {
    console.log("ERROR: %s:%s", err.name, err.msg);
  });
};

/**
 * Retorna os tempos das visitas dos DispMoveis
 * @param {type} req
 * @param {type} res
 * @returns {undefined}
 */
module.exports.getAllTimes = function (req, res) {
  r.connect(self.dbData).then(function (conn) {
    return r.db(self.getDataBase(req.params.sock)).table("DispMoveis").map(function (a) {
      return {"row": a, "state": a("disp").contains(function (b) {
          return b("values").contains(function (c) {
            return c("Last_time").ge(r.now().toEpochTime().sub(3600));
          });
        })};
    }).filter({"state": true}).without("state")("row")
        .coerceTo("array")
        .run(conn)
        .finally(function () {
          conn.close();
        });
  }).then(function (result2) {

    var tempo = new Worker('./lib/TempoMedio.js');
    var result = [];
    //Na resposta do webworker
    tempo.onmessage = function (msg) {
      res.json(JSON.stringify(msg.data));
      tempo.terminate();
    };

    //worker start
    tempo.postMessage(result2);
  }).error(function (err) {
    console.log("ERROR: %s:%s", err.name, err.msg);
  });
};

/**
 * Retorna o numero de Disp nos sensores por fabricante
 * @param {type} req
 * @param {type} res
 * @returns {undefined}
 */
module.exports.getFabricantes = function (req, res) {
  r.connect(self.dbData).then(function (conn) {
    return r.db(self.getDataBase(req.params.sock))
        .table('DispMoveis')
        .coerceTo("array")
        .run(conn)
        .finally(function () {
          conn.close();
        });
  }).then(function (result) {
    res.send(getMACInDate(req.params.min, result));
  }).error(function (err) {
    console.log("ERROR: %s:%s", err.name, err.msg);
  });
};

/**
 * Retorna as bases de dados dos varios sites
 * @param {type} req
 * @param {type} res
 * @returns {undefined}
 */
module.exports.getDataBases = function (req, res) {
  r.connect(self.dbData).then(function (conn) {
    return r.dbList().map({"db": r.row})
        .filter(r.row("db").ne("rethinkdb"))
        .filter(r.row("db").ne("user"))
        .run(conn)
        .finally(function () {
          conn.close();
        });
  }).then(function (result) {
    res.send(result);
  }).error(function (err) {
    console.log("ERROR: %s:%s", err.name, err.msg);
  });
};

/**
 * Devolve os sensores do site selecionado
 * @param {type} req
 * @param {type} res
 * @returns {undefined}
 */
module.exports.getSensors = function (req, res) {
  r.connect(self.dbData).then(function (conn) {
    return r.db(self.getDataBase(req.params.id)).table("ActiveAnt")
        .coerceTo("ARRAY")
        .run(conn)
        .finally(function () {
          conn.close();
        });
  }).then(function (result) {
    res.send(result);
  }).error(function (err) {
    console.log("ERROR: %s:%s", err.name, err.msg);
  });
};

/**
 * Devolve o fabricante do dispositivo com o mac adderess encontrado no site selecionado
 * @param {type} req
 * @param {type} res
 * @returns {undefined}
 */
module.exports.getNameVendorByMac = function (req, res) {
  r.connect(self.dbData).then(function (conn) {
    return r.db(self.getDataBase(req.params.id))
        .table("DispMoveis")
        .get(req.params.mac)("nameVendor")
        .run(conn)
        .finally(function () {
          conn.close();
        });
  }).then(function (result) {
    res.send(result);
  }).error(function (err) {
    console.log("ERROR: %s:%s", err.name, err.msg);
  });
};

/**
 * 
 * @param {type} req
 * @param {type} res
 * @returns {undefined}
 */
module.exports.getLastAllTimes = function (req, res) {
  if (liveActives[self.getDataBase(req.params.id)] != undefined) {
    var last = _.last(liveActives[self.getDataBase(req.params.id)].array);
    res.json(last);
  }
};

/**
 * Devolve a lista de dispositivos ativos por tipo e por sensor
 * @param {type} req
 * @param {type} res
 * @returns {undefined}
 */
module.exports.getActiveDisps = function (req, res) {
  var table = "";
  // seleciona a tabela de acordo com o tipo do dispositivo
  if (req.params.table == "disp") {
    table = "AntDisp";
  } else if (req.params.table == "ap") {
    table = "AntAp";
  } else {
    res.send("erro");
    return;
  }
  r.connect(self.dbData).then(function (conn) {
    return r.db(self.getDataBase(req.params.id))
        .table(table)
        .get(req.params.sensor)("host")
        .do(function (row) {
          return row.filter(function (a) {
            return a("data").ge(r.now().toEpochTime().sub(60));
          }).withFields("macAddress", "nameVendor", "Power", "data");
        }).coerceTo("ARRAY")
        .run(conn)
        .finally(function () {
          conn.close();
        });
  }).then(function (result) {
    res.send(result);
  }).error(function (err) {
    console.log("ERROR: %s:%s", err.name, err.msg);
  });
};

// ------------------------------------ Fim Page DashBoard ------------------------------------

//************************************* Page Details *************************************

/**
 * 
 * @param {type} req
 * @param {type} res
 * @returns {undefined}
 */
module.exports.getAllOrderbyVendor = function (req, res) {
  var min = req.params.min;//new Date(req.params.min).toJSON();
  var max = req.params.max;//new Date(req.params.max).toJSON();
  var table = ((req.params.table).toString().toUpperCase() == "AP") ? "DispAp" : "DispMoveis";
  r.connect(self.dbData).then(function (conn) {
    return r.db(self.getDataBase(req.params.id)).table(table).filter(function (row) {
      return row("disp")("values").contains(function (a) {
        return a("Last_time").contains(function (b) {
          return b.ge(r.ISO8601(min).toEpochTime()).and(b.le(r.ISO8601(max).toEpochTime()));
        });
      });
    }).group("nameVendor").filter(function (a) {
      return a("disp").contains(function (b) {
        return b("name").eq(req.params.sensor);
      });
    }).coerceTo("ARRAY")
        .run(conn)
        .finally(function () {
          conn.close();
        });
  }).then(function (result) {
    res.send(result);
  }).error(function (err) {
    console.log("ERROR: %s:%s", err.name, err.msg);
  });
};

/**
 * Devolve a tabela DispMoveis filtrada pelo nome do sensor
 * @param {type} req
 * @param {type} res
 * @returns {undefined}
 */
module.exports.getDispMoveisbySensor = function (req, res) {
  r.connect(self.dbData).then(function (conn) {
    return r.db(self.getDataBase(req.params.id)).table("DispMoveis").filter(function (row) {
      return row("disp")("name").contains(function (a) {
        return a.match("^" + req.params.sensor + "$");
      });
    }).group("nameVendor")
        .coerceTo("ARRAY")
        .run(conn)
        .finally(function () {
          conn.close();
        });
  }).then(function (result) {
    res.send(result);
  }).error(function (err) {
    console.log("ERROR: %s:%s", err.name, err.msg);
  });
};

/**
 * Decolve a planta do local onde  o sensor de encontra
 * @param {type} req
 * @param {type} res
 * @returns {undefined}
 */
module.exports.getPlantSite = function (req, res) {
  r.connect(self.dbData).then(function (conn) {
    return r.db(self.getDataBase(req.params.id))
        .table("plantSite")
        .get(req.params.sensor)("img")
        .run(conn)
        .finally(function () {
          conn.close();
        });
  }).then(function (result) {
    res.json(result);
  }).error(function (err) {
    console.log("ERROR: %s:%s", err.name, err.msg);
  });
};

// ------------------------------------ Fim Page Details ------------------------------------

//************************************* Page DetailAP *************************************

/**
 * Devolve todos os ap organizados por macaddress e essid 
 * @param {type} req
 * @param {type} res
 * @returns {undefined}
 */
module.exports.getAllAP = function (req, res) {
  r.connect(self.dbData).then(function (conn) {
    return r.db(self.getDataBase(req.params.id))
        .table("AntAp")("host")
        .group("macAddress", "ESSID")
        .run(conn)
        .finally(function () {
          conn.close();
        });
  }).then(function (result) {
    res.send(result);
  }).error(function (err) {
    console.log("ERROR: %s:%s", err.name, err.msg);
  });
};

/**
 * retorna os dispositivos que estiveram ligados a um determinado ap
 * @param {type} req
 * @param {type} res
 * @returns {undefined}
 */
module.exports.getDispConnectedtoAp = function (req, res) {
  r.connect(self.dbData).then(function (conn) {
    return r.db(self.getDataBase(req.params.id))
        .table("DispMoveis")
        .filter(function (row) {
          return row("disp")("values").contains(function (a) {
            return a("BSSID").contains(function (b) {
              return b.match(req.params.mac);
            });
          });
        }).coerceTo("array")
        .run(conn)
        .finally(function () {
          conn.close();
        });
  }).then(function (result) {
    res.send([result, req.params.mac]);
  }).error(function (err) {
    console.log("ERROR: %s:%s", err.name, err.msg);
  });
};

/**
 * Retorna a data ISO8060 da primeira vez que um AP foi visto
 * @param {type} req
 * @param {type} res
 * @returns {undefined}
 */
module.exports.getApFirstTime = function (req, res) {
  r.connect(self.dbData).then(function (conn) {
    return r.db(self.getDataBase(req.params.id))
        .table("DispAp")
        .get(req.params.mac)("disp")("First_time")
        .min().do(function (result) {
      return [result, r.db(self.getDataBase(req.params.id))
            .table("DispAp")
            .get(req.params.mac)("disp")("values")
            .nth(0)("Last_time").max()];
    }).run(conn)
        .finally(function () {
          conn.close();
        });
  }).then(function (result) {
    res.send(result);
  }).error(function (err) {
    console.log("ERROR: %s:%s", err.name, err.msg);
  });
};

/**
 * Devolve os mac dos clientes organizados pelo fabricante
 * @param {type} req
 * @param {type} res
 * @returns {undefined}
 */
module.exports.getDispMacbyVendor = function (req, res) {
  r.connect(self.dbData).then(function (conn) {
    return r.db(self.getDataBase(req.params.id))
        .table("DispMoveis")
        .group("nameVendor")("macAddress")
        .coerceTo("ARRAY")
        .run(conn)
        .finally(function () {
          conn.close();
        });
  }).then(function (result) {
    res.send(result);
  }).error(function (err) {
    console.log("ERROR: %s:%s", err.name, err.msg);
  });
};

/**
 * Retorna a row referente ao device (mac) 
 * @param {type} req
 * @param {type} res
 * @returns {undefined}
 */
module.exports.getApbyMac = function (req, res) {
  r.connect(self.dbData).then(function (conn) {
    return r.db(self.getDataBase(req.params.id))
        .table("DispAp")
        .get(req.params.mac)
        .run(conn)
        .finally(function () {
          conn.close();
        });
  }).then(function (result) {
    res.send(JSON.stringify(result));
  }).error(function (err) {
    console.log("ERROR: %s:%s", err.name, err.msg);
  });
};


// ------------------------------------ Fim Page DetailAP ------------------------------------

/**
 * Retorna a row referente ao device (mac) 
 * @param {type} req
 * @param {type} res
 * @returns {undefined}
 */
module.exports.getDispbyMac = function (req, res) {
  r.connect(self.dbData).then(function (conn) {
    return r.db(self.getDataBase(req.params.id))
        .table("DispMoveis")
        .get(req.params.mac)
        .run(conn)
        .finally(function () {
          conn.close();
        });
  }).then(function (result) {
    res.send(JSON.stringify(result));
  }).error(function (err) {
    console.log("ERROR: %s:%s", err.name, err.msg);
  });
};


//************************************* Pedidos do Socket *************************************

/**
 * Devolve alista de bases de dados para o socket
 * @param {type} callback
 * @returns {undefined}
 */
module.exports.getAllDataBases = function (callback) {
  connectdb.onConnect(function (err, conn) {
    r.dbList().map({"db": r.row})
        .filter(r.row("db").ne("rethinkdb"))
        .filter(r.row("db").ne("user"))
        .run(conn, function (err, result) {
          if (err) {
            callback(err.msg, null);
            console.log("ERROR: %s:%s", err.name, err.msg);
          } else {
            callback(null, result);
          }
        });
  });
};

/**
 * Cria a ligacao e fica a escuta de alteracoes nas varias tabelas passadas por 
 * parametro de cada site passado por parametro
 * @param {type} database   Site 
 * @param {type} socket     Socket para comunicacao das alteracoes
 * @param {type} table      Tabela em escuta de alteracoes
 * @param {type} nemedisp   Tipo do dispositivo
 * @returns {undefined}
 * 
 */
module.exports.changeTablesDisps = function (database, socket, table, nemedisp) {
  connectdb.onConnect(function (err, conn) {
    r.db(database).table(table)
        .changes()
        .filter(function (row) {
          return row('old_val').eq(null);
        }).run(conn)
        .then(function (cursor) {
          cursor.each(function (err, item) {
            socket.emit("newDisp", item, nemedisp, database);
          });
        });
  });
};

/**
 * escuta de alteracoes para a criacao do grafico em realtime do power dos 
 * varios dispositivos a tivos no ultimo minuto 
 * @param {type} database   Site
 * @param {type} socket     Socker de comunicacao
 * @param {type} table      Tabela em escuta de alteracoes
 * @param {type} nomedisp   Tipo do dispositivo 
 * @returns {undefined}
 */
module.exports.changeTableAnt = function (database, socket, table, nomedisp) {
  connectdb.onConnect(function (err, conn) {
    r.db(database).table(table)
        .changes()('new_val')
        .map(function (v) {
          return {"sensor": v("nomeAntena"), "hosts": v("host").do(function (row) {
              return row.filter(function (o) {
                return o("data").ge(r.now().toEpochTime().sub(60));
              }).withFields("macAddress", "nameVendor", "Power", "data");
            })};
        }).run(conn)
        .then(function (cursor) {
          cursor.each(function (err, item) {
            socket.emit("updateRealTimeChart", item, nomedisp, database);
          });
        });
  });
};

/**
 * Escuta de novo sensor adicionado ao site
 * @param {type} database Site
 * @param {type} socket   Socket de comunicacao
 * @returns {undefined}
 */
module.exports.changeActiveAnt = function (database, socket) {
  connectdb.onConnect(function (err, conn) {
    r.db(database).table("ActiveAnt")
        .changes()('new_val').withFields("nomeAntena", "cpu", "disc", "memory", "data").run(conn)
        .then(function (cursor) {
          cursor.each(function (err, item) {
            socket.emit("changeActiveAnt", item, database);
          });
        });
  });
};

/**
 * 
 * @param {type} req
 * @param {type} res
 * @returns {undefined}
 */
module.exports.getAllDisp = function (iduser, socket) {
  if (liveActives[self.getDataBase(iduser)] != undefined) {
    socket.emit("getAllDisp", liveActives[self.getDataBase(iduser)].array, self.getDataBase(iduser));
  } else {
    liveActives[self.getDataBase(iduser)] = {};
    connectdb.onConnect(function (err, conn) {
      r.db(self.getDataBase(iduser)).table("DispMoveis").map(function (a) {
        return {"row": a, "state": a("disp").contains(function (b) {
            return b("values").contains(function (c) {
              return c("Last_time").ge(r.now().toEpochTime().sub(3600));
            });
          })};
      }).filter({"state": true}).without("state")("row")
          .coerceTo("ARRAY")
          .run(conn, function (err, result) {
            if (err) {
              console.log("ERROR: %s:%s", err.name, err.msg);
            } else {

              var work = new Worker('./lib/workerGraph.js');
              work.postMessage(result);
              work.onmessage = function (msg) {
                liveActives[self.getDataBase(iduser)].array = msg.data;
                work.terminate();
                socket.emit("getAllDisp", msg.data, self.getDataBase(iduser));
              };

              //Interval de update do grafico nos clientes
              liveActives[self.getDataBase(iduser)].intervalChart = setInterval(function () {
                if (typeof liveActives[self.getDataBase(iduser)] != "undefined" && liveActives[self.getDataBase(iduser)] != null && liveActives[self.getDataBase(iduser)].array != undefined) {
                  connectdb.onConnect(function (err, conn) {
                    r.db(self.getDataBase(iduser)).table("DispMoveis").map(function (row) {
                      return  row("disp").do(function (ro) {
                        return {"macAddress": row("macAddress"), "values": ro("values").nth(0).orderBy(r.desc("Last_time")).limit(10).orderBy(r.asc("Last_time"))};
                      });
                    }).map(function (a) {
                      return {"macAddress": a('macAddress'), "state": a('values').contains(function (value) {
                          return value("Last_time").ge(r.now().toEpochTime().sub(60));
                        })};
                    }).filter({"state": true})
                        .count().run(conn, function (err, result) {
                      if (err) {
                        console.log("ERROR: %s:%s", err.name, err.msg);
                      } else {
                        //Atualiza o array do servidor       
                        var novaData = new Date(liveActives[self.getDataBase(iduser)].array[liveActives[self.getDataBase(iduser)].array.length - 1].x);
                        novaData.addMinutes(1);
                        liveActives[self.getDataBase(iduser)].array.shift();
                        var x = {x: novaData.toISOString(), y: result * 1};
                        liveActives[self.getDataBase(iduser)].array.push(x);
                        //Envia para os clientes
                        socket.emit("updateChart", x, self.getDataBase(iduser));
                      }
                      conn.close();
                    });
                  });
                } else {
                  clearInterval(this);
                }
              }, 1000 * 60); //De minuto a minuto
            }
            conn.close();
          });
    });
  }
};
// --------------------------------- Fim dos pedidos do socket ---------------------------------


module.exports.getLiveActives = function () {
  return liveActives;
};

Date.prototype.addMinutes = function (h) {
  this.setMinutes(this.getMinutes() + h);
  return this;
};