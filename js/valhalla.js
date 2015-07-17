var app = angular.module('routing', []);
var hash_params = L.Hash.parseHash(location.hash);
var mode_mapping = { 'foot' : 'pedestrian', 'car' : 'auto', 'bicycle' : 'bicycle', 'transit' : 'multimodal'};
var date = new Date();
var isoDateTime = date.toISOString();  //"2015-06-12T15:28:46.493Z"
var serviceUrl;
var envToken;
var envServer;

function selectEnv(){
	$( "option:selected" ).each(function() {
	  envServer = $( this ).text();
	  serviceUrl =  document.getElementById(envServer).value;
	  getEnvToken();
	});
}

function getEnvToken(){
  switch (envServer) {
  case "localhost":
	  envToken = accessToken.local;
	  break;
  case "development":
	  envToken = accessToken.dev;
	  break;
  case "production":
	  envToken = accessToken.prod;
	  break;
  }
}

//sets ISO date time to 12:15 of current date on initial transit run
function parseIsoDateTime(dtStr) {
  var dt = dtStr.split("T");
	return dtStr.replace(dt[1],"12:15:00");
}	
var dateStr = parseIsoDateTime(isoDateTime.toString());

var inputElement = document.getElementById("inputFile");
inputElement.addEventListener("change", selectFiles, false);

function selectFiles(evt) {
  if (typeof evt.target != "undefined") {
	  var files =  evt.target.files;
	  
	  if (!files.length) {
	    alert('Please select a file!');
	    return;
	  }
	  var file = files[0];
	  var reader = new FileReader();
	  var delimiter = "-j";
	  reader.onloadend = function(evt) {
	    if (evt.target.readyState == FileReader.DONE) {
	      var lines = evt.target.result.split(delimiter);
	      var output = "";
	      var index;
		  var select = document.getElementById('selector').options.length = 0;
		  if (lines[0]=="") {
		      for (index = 1; index < lines.length; index++) {
		    	  var newOption = document.createElement('option');
		          var pattern = new RegExp("{\".*}}", "g");
		          var results = pattern.exec(unescape(lines[index]));
		          lines[index] = results[0];
		          newOption.text = lines[index];
		          newOption.value = index;
		          //reset selector options
		          select = document.getElementById('selector');
		          try {
		            select.add(newOption, null);
		          } catch (ex) {
		            select.add(newOption);
		          }
		        }
		  } else { //loads files without -j and config/json in formatting
			  for (index = 0; index < lines.length; index++) {
		    	  var newOption = document.createElement('option');
		          var pattern = new RegExp("{\".*}", "g");
		          var results = pattern.exec(unescape(lines[index]));
		          lines[index] = results[0];
		          newOption.text = lines[index];
		          newOption.value = index;
		          //reset selector options
		          select = document.getElementById('selector');
		          try {
		            select.add(newOption, null);
		          } catch (ex) {
		            select.add(newOption);
		          }
		        }
		  }
	    }
	  };
	  reader.readAsText(file);
  }
}


app.run(function($rootScope) {
	  var hash_loc = hash_params ? hash_params : {'center': {'lat': 40.7486, 'lng': -73.9690}, 'zoom': 13};
	  $rootScope.geobase = {
	    'zoom': hash_loc.zoom,
	    'lat' : hash_loc.center.lat,
	    'lon' : hash_loc.center.lng
	  }
	  $(document).on('new-location', function(e){
	    $rootScope.geobase = {
	      'zoom': e.zoom,
	      'lat' : e.lat,
	      'lon' : e.lon
	    };
	  })
});

app.controller('RouteController', function($scope, $rootScope, $sce, $http) {
	  
  $scope.route_instructions = '';
  
  var map = L.map('map', {
      zoom: $rootScope.geobase.zoom,
      zoomControl: false,
      center: [$rootScope.geobase.lat, $rootScope.geobase.lon]
  });

  var Locations = [];
  var mode = 'car';

  var icon = L.icon({
	    iconUrl: 'resource/dot.png',

	    iconSize:     [38, 35], // size of the icon
	    shadowSize:   [50, 64], // size of the shadow
	    iconAnchor:   [22, 34], // point of the icon which will correspond to marker's location
	    shadowAnchor: [4, 62],  // the same for the shadow
	    popupAnchor:  [-3, -76] // point from which the popup should open relative to the iconAnchor
		});

	var mode_icons = {
	  'car' : 'js/images/drive.png',
	  'foot': 'js/images/walk.png',
	  'bicycle': 'js/images/bike.png'
	};

	var getStartIcon = function(icon){
	  return L.icon({
	    iconUrl: 'resource/startmarker@2x.png',

	    iconSize:     [44, 56], // size of the icon
	    iconAnchor: [22, 50]

	  });
	};

	var getEndIcon = function(icon){
	  return L.icon({
	    iconUrl: 'resource/destmarker@2x.png',
	    iconSize:   [44, 56], // size of the icon
	    iconAnchor: [22, 50]
	  });
	};

	var getFileOriginIcon = function(icon){
	  return L.icon({
	    iconUrl: 'resource/start_greendot.png',

	   // iconSize:     [44, 56], // size of the icon
	   // iconAnchor: [22, 50]

	  });
	};
	
	var getFileDestIcon = function(icon){
	  return L.icon({
	    iconUrl: 'resource/destmarker@2x.png',
	   // iconSize:   [44, 56], // size of the icon
	   // iconAnchor: [22, 50]
	  });
	};

	//TODO:  Switch out maps based on travel mode
	L.tileLayer('http://{s}.tile.thunderforest.com/transport/{z}/{x}/{y}.png', {
	    attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a>',
	    maxZoom: 18
	}).addTo(map);

	// Set up the hash
	  var hash = new L.Hash(map);
	  var markers = [];
	  var remove_markers = function(){
	    for (i=0; i<markers.length; i++) {
	      map.removeLayer(markers[i]);
	    }
	    markers = [];
	  };

	  // Number of locations
	  var locations = 0;
	  
	  var reset = function() {
	    $('svg').html('');
	    $('.leaflet-routing-container').remove();
	    $('.leaflet-marker-icon.leaflet-marker-draggable').remove();
	    $scope.$emit( 'resetRouteInstruction' );
	    remove_markers();
	    locations = 0;
	  };

	  $rootScope.$on( 'map.setView', function( ev, geo, zoom ){
	    map.setView( geo, zoom || 8 );
	  });
	  $rootScope.$on( 'map.dropMarker', function( ev, geo, m){

	    if (locations == 0) {
	      var marker = new L.marker(geo, {icon: getStartIcon(m || 'car')});
	    }
	    else {
	      var marker = new L.marker(geo, {icon: getEndIcon(m || 'car')});
	    }
	    map.addLayer(marker);
	    markers.push(marker);
	    //marker.openPopup();
	  });
	  
	  $rootScope.$on( 'map.dropOriginMarker', function( ev, geo, m){

	    if (locations == 0) {
	      var marker = new L.marker(geo, {icon: getFileOriginIcon(m || 'car')});
	    }
	    else {
	      var marker = new L.marker(geo, {icon: getFileOriginIcon(m || 'car')});
	    }
	    map.addLayer(marker);
	    markers.push(marker);
	    //marker.openPopup();
	  });
	  
	  $rootScope.$on( 'map.dropDestMarker', function( ev, geo, m){

		    if (locations == 0) {
		      var marker = new L.marker(geo, {icon: getFileDestIcon(m || 'car')});
		    }
		    else {
		      var marker = new L.marker(geo, {icon: getFileDestIcon(m || 'car')});
		    }
		    map.addLayer(marker);
		    markers.push(marker);
		    //marker.openPopup();
		  });
		  
	  $scope.renderHtml = function(html_code){
	    return $sce.trustAsHtml(html_code);
	  };

	  $scope.$on( 'setRouteInstruction', function( ev, instructions ) {
	    $scope.$apply(function(){
	      $scope.route_instructions = instructions;
	    });
	  });

	  $scope.$on( 'resetRouteInstruction', function( ev ) {
	    $scope.$apply(function(){
	      $scope.route_instructions = '';
	    });
	  });
	  
	  document.querySelector(".select").addEventListener('click',
			  function(evt) {
			 //   if (e.target.tagName.toLowerCase() == 'button') {
			      var select = document.getElementById('selector');
			      var i;
			      for (i = 0; i < select.length; i++) {
			        if (select.options[i].selected) {
				    	Locations = [];
					    reset();
			        	var json = JSON.parse(select.options[i].innerHTML);
			        	var mode = json.costing;
			        	var options = json.directions_options;
			        	
			        	if (json.locations.length == 2) {
			        		var geo = {
			    	          'olat' : json.locations[0].lat,
			    	          'olon' : json.locations[0].lon,
			    	          'dlat' : json.locations[1].lat,
			    	          'dlon' : json.locations[1].lon
				        	}
				        if (json.locations == 2) {
				          Locations.push({lat: geo.olat, lon: geo.olon })
					   //   $rootScope.$emit( 'map.dropOriginMarker', [geo.olat, geo.olon], mode);
				          Locations.push({lat: geo.dlat, lon: geo.dlon })
						//  $rootScope.$emit( 'map.dropDestMarker', [geo.dlat, geo.dlon], mode);
					      //locations++;
					      return;
					    } else if (json.locations > 2) {
				    	  Locations = [];
					      reset();
					      /*Locations.push({lat: geo.lat, lon: geo.lon })
					      $rootScope.$emit( 'map.dropFileMarker', [geo.lat, geo.lon], mode);
					      locations++;*/
					      return;
					    }
			        	
					    var waypoints = [];
					    Locations.forEach(function(gLoc) {
					      waypoints.push(L.latLng(gLoc.lat, gLoc.lon));
					    });

					    waypoints.push(L.latLng(geo.olat, geo.olon));
					    waypoints.push(L.latLng(geo.dlat, geo.dlon));

					   // $rootScope.$emit( 'map.dropOriginMarker', [geo.olat, geo.olon], mode);
					   // $rootScope.$emit( 'map.dropDestMarker', [geo.dlat, geo.dlon], mode);
					    locations++;
			        	}
					    valhalla_mode = mode_mapping[mode];

					var rr = L.Routing.control({
					  waypoints: waypoints,
					  geocoder: null,
					  transitmode: valhalla_mode,
					  routeWhileDragging: false,
					  router: L.Routing.valhalla(envToken,'auto'),
					  summaryTemplate:'<div class="start">{name}</div><div class="info {transitmode}">{distance}, {time}</div>',
					  
					  createMarker: function(i,wp,n){
				      var iconV;
				        if(i == 0){
				          iconV = L.icon({
				          iconUrl: 'resource/start_green_dot.gif',
				          iconSize:[24,24]
				          });
				        }else{
				          iconV = L.icon({
				          iconUrl: 'resource/dest_red_dot.png',
				          iconSize:[24,24]
				        })
				        }
				        var options = {
				          draggable: true,
				          icon: iconV
				        }
				        return L.marker(wp.latLng,options);
					  },
					  formatter: new L.Routing.Valhalla.Formatter(),
					    pointMarkerStyle: {radius: 6,color: '#25A5FA',fillColor: '#5E6472',opacity: 1,fillOpacity: 1}
						}).addTo(map);
					
				  var driveBtn = document.getElementById("drive_btn");
				  var bikeBtn = document.getElementById("bike_btn");
				  var walkBtn = document.getElementById("walk_btn");
				  var multiBtn = document.getElementById("multi_btn");
				  var datetime = document.getElementById("datetimepicker");
				  
				  driveBtn.addEventListener('click', function (e) {
					getEnvToken();
				    rr.route({transitmode: 'auto'});
				  });

				  bikeBtn.addEventListener('click', function (e) {
					getEnvToken();
				    rr.route({transitmode: 'bicycle'});
				  });

				  walkBtn.addEventListener('click', function (e) {
					getEnvToken();
				    rr.route({transitmode: 'pedestrian'});
				  }); 

				  multiBtn.addEventListener('click', function (e) {
					getEnvToken();
				    rr.route({transitmode: 'multimodal', date_time: dateStr});
				  });

				  function datetimeUpdate(datetime) {
				      var changeDt = datetime;
				      var inputDate, splitDate, year, month, day, time, hour, minute; 
				       if(changeDt != null){
				   	     if (changeDt.length >= 11) {
				   	    	inputDate = changeDt.split(" ");
				   	    	splitDate = inputDate[0].split("-");
				     	    day = splitDate[0];
				     	    if (day < 10) {
				      	      day = '0' + day;
				      	    } 
				     	    month = GetMonthIndex(splitDate[1])+1;
				     	   if (month < 10) {
				     		  month = '0' + month;
				       	    } 
				     	    year = splitDate[2];
				     	  
				    	  time = inputDate[1].split(":");
				     	  hour = time[0];
				     	  minute = time[1];
				   	      
				   	      dateStr = year + "-" + month + "-" + day + "T" + hour + ":" + minute;
				   	    } else {
				   		    dateStr = parseIsoDateTime(isoDateTime.toString());
				   	    }
				   	    multiBtn.click();	
				       }

				  };

				  $(document).on('mode-alert', function(e, m) {
				    mode = m;
				    reset();
				    Locations = [];
				  });

				  $(document).on('route:time_distance', function(e, td){
				    var instructions = $('.leaflet-routing-container.leaflet-control').html();
				    $scope.$emit( 'setRouteInstruction', instructions);
				  });

				  $("#datepicker").on("click", function() {
			    		datetimeUpdate(this.value);
			    	  });
			    }
			  }
				  }, false); 

	  map.on('click', function(e) {
	    var geo = {
	      'lat': e.latlng.lat,
	      'lon': e.latlng.lng
	    };
	    
        if (locations == 0) {
	      Locations.push({lat: geo.lat, lon: geo.lon })
	      $rootScope.$emit( 'map.dropMarker', [geo.lat, geo.lon], mode);
	      locations++;
	      return;
	    } else if (locations > 1) {
	      Locations = [];
	      reset();

	      Locations.push({lat: geo.lat, lon: geo.lon })
	      $rootScope.$emit( 'map.dropMarker', [geo.lat, geo.lon], mode);
	      locations++;
	      return;
	    }

	    var waypoints = [];
	    Locations.forEach(function(gLoc) {
	      waypoints.push(L.latLng(gLoc.lat, gLoc.lon));
	    });

	    waypoints.push(L.latLng(geo.lat, geo.lon));

	    $rootScope.$emit( 'map.dropMarker', [geo.lat, geo.lon], mode);
	    locations++;
	    
	    valhalla_mode = mode_mapping[mode];

	var rr = L.Routing.control({
	  waypoints: waypoints,
	  geocoder: null,
	  transitmode: valhalla_mode,
	  routeWhileDragging: false,
	  router: L.Routing.valhalla(envToken,'auto'),
	  summaryTemplate:'<div class="start">{name}</div><div class="info {transitmode}">{distance}, {time}</div>',
	  
	  createMarker: function(i,wp,n){
      var iconV;
        if(i == 0){
          iconV = L.icon({
          iconUrl: 'resource/dot.png',
          iconSize:[24,24]
          });
        }else{
          iconV = L.icon({
          iconUrl: 'resource/dot.png',
          iconSize:[24,24]
        })
        }
        var options = {
          draggable: true,
          icon: iconV
        }
        return L.marker(wp.latLng,options);
	  },
	  formatter: new L.Routing.Valhalla.Formatter(),
	    pointMarkerStyle: {radius: 6,color: '#25A5FA',fillColor: '#5E6472',opacity: 1,fillOpacity: 1}
		}).addTo(map);
	
  var driveBtn = document.getElementById("drive_btn");
  var bikeBtn = document.getElementById("bike_btn");
  var walkBtn = document.getElementById("walk_btn");
  var multiBtn = document.getElementById("multi_btn");
  var datetime = document.getElementById("datetimepicker");
  
  driveBtn.addEventListener('click', function (e) {
	getEnvToken();
    rr.route({transitmode: 'auto'});
  });

  bikeBtn.addEventListener('click', function (e) {
	getEnvToken();
    rr.route({transitmode: 'bicycle'});
  });

  walkBtn.addEventListener('click', function (e) {
	getEnvToken();
    rr.route({transitmode: 'pedestrian'});
  }); 

  multiBtn.addEventListener('click', function (e) {
	getEnvToken();
    rr.route({transitmode: 'multimodal', date_time: dateStr});
  });

  function datetimeUpdate(datetime) {
      var changeDt = datetime;
      var inputDate, splitDate, year, month, day, time, hour, minute; 
       if(changeDt != null){
   	     if (changeDt.length >= 11) {
   	    	inputDate = changeDt.split(" ");
   	    	splitDate = inputDate[0].split("-");
     	    day = splitDate[0];
     	    if (day < 10) {
      	      day = '0' + day;
      	    } 
     	    month = GetMonthIndex(splitDate[1])+1;
     	   if (month < 10) {
     		  month = '0' + month;
       	    } 
     	    year = splitDate[2];
     	  
    	  time = inputDate[1].split(":");
     	  hour = time[0];
     	  minute = time[1];
   	      
   	      dateStr = year + "-" + month + "-" + day + "T" + hour + ":" + minute;
   	    } else {
   		    dateStr = parseIsoDateTime(isoDateTime.toString());
   	    }
   	    multiBtn.click();	
       }

  };

  $(document).on('mode-alert', function(e, m) {
    mode = m;
    reset();
    Locations = [];
  });

  $(document).on('route:time_distance', function(e, td){
    var instructions = $('.leaflet-routing-container.leaflet-control').html();
    $scope.$emit( 'setRouteInstruction', instructions);
  });

  $("#datepicker").on("click", function() {
	datetimeUpdate(this.value);
  });
  
  $(function () {
    $("#button1").click(function (evt) {
    	evt.preventDefault();
        $('#file').trigger('click');
    });
    document.getElementById('inputFile').addEventListener('change', selectFiles, false);
  });
  
  });
	    
	  
})