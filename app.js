/*
	Routing capability using the Leaflet framework
	Copyright (c) 2013, Turistforeningen, Hans Kristian Flaatten

	https://github.com/Turistforeningen/leaflet-routing
*/

var routing;

(function() {
  "use strict";
  jQuery(function($) {        
    var api, apiKey, rUrl, sUrl, topo, map, snapping, myRouter;
    
    api = window.location.hash.substr(1).split('@');
    if (api.length === 2) {
      rUrl = 'http://' + api[1] + '/route/?coords='
      sUrl = 'http://' + api[1] + '/bbox/?bbox=';
      apiKey = api[0];
    } else {
      throw new Error('API auth failed');
    }
    
    topo = L.tileLayer('http://opencache.statkart.no/gatekeeper/gk/gk.open_gmaps?layers=topo2&zoom={z}&x={x}&y={y}', {
      maxZoom: 16,
      attribution: '<a href="http://www.statkart.no/">Statens kartverk</a>'
    });
    
    map = new L.Map('map', {
      layers: [topo]
      ,center: new L.LatLng(61.5, 9)
      ,zoom: 13
    });
    
    // Snapping Layer
    snapping = new L.geoJson(null, {
      style: {
        opacity:0
        ,clickable:false
      }
    }).addTo(map);
    map.on('moveend', function() {
      if (map.getZoom() > 12) {
        var url;        
        url = sUrl + map.getBounds().toBBoxString() + '&callback=?';
        $.getJSON(url).always(function(data, status) {
          if (status === 'success') {
            data = JSON.parse(data);
            if (data.geometries && data.geometries.length > 0) {
              snapping.clearLayers();
              snapping.addData(data);
            }
          } else {
            console.error('Could not load snapping data');
          }          
        });
      } else {
        snapping.clearLayers();
      }
    });
    map.fire('moveend');
    snapping.on('click', function() {
      console.log('click click');
    });
    
    // Routing Function
    // @todo speed up geometryToLayer()
    myRouter = function(l1, l2, cb) {
      var req = $.getJSON(rUrl + [l1.lng, l1.lat, l2.lng, l2.lat].join(',') + '&callback=?');
      req.always(function(data, status) {
        if (status === 'success') {
          try {
            L.GeoJSON.geometryToLayer(JSON.parse(data)).eachLayer(function (layer) {
              return cb(null, layer);
            });
          } catch(e) {
            return cb(new Error('Invalid JSON'));
          }
        } else {
          return cb(new Error('Routing failed'));
        }        
      });
    }
    
    // Leaflet Routing Module
    routing = new L.Routing({
      position: 'topleft'
      ,routing: {
        router: myRouter
      }
      ,snapping: {
        layers: [snapping]
        ,sensitivity: 15
        ,vertexonly: false
      }
    });
    map.addControl(routing);
    routing.draw(true); // enable drawing mode
    
    $('#eta-export').on('click', function() {
      var id = $('#eta-id').val();
      if (!id) { alert('Ingen tp_id definert!'); return; } 
      if (confirm('Eksport til ETA vil overskrive eksisterende geometri!')) {
        routing.toGeoJSON(function(res) {
          var data = [];
          for (var i = 0; i < res.length; i++) {
            data.push(res[i][1] + ' ' + res[i][0]);
          }
          data = 'LINESTRING(' + data.join(',') + ')';
          $.post('http://localhost:8080/app/lib/ajax/post_geom.php?api_key=' + apiKey + '&tp_id=' + id, {coords: data}, function(data) {
            if (data.error) {
              alert('Eksport feilet med feilkode ' + data.error);
            } else if (data.success) {
              alert('Eksport suksess!');
            }
          });
        });
      }
    });
    
  });
}).call(this);
