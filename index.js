const geocoder = require('google-geocoder');
const { readFileSync } = require('fs');

const key = readFileSync('api.key', 'utf8');  
const geo = geocoder({key: key});
const data = JSON.parse(readFileSync('Location History.json', 'utf8'));

class Location {
  constructor(lat, long) {
    this.lat = lat;
    this.long = long;
    this.timeStamps = new Array();
    this.address = "add";
    this.place_id = "id";
  }
}

let entries = {};

data.locations.forEach( function(entry) {
  const lat = entry.latitudeE7 / 1E7;
  const long = entry.longitudeE7 / 1E7;
  const coord = `${lat}, ${long}`;
  if (!entries[coord]){
    entries[coord] = new Location(lat, long);
    // getInfo(id); billable
  }
  entries[coord].timeStamps.push(new Date(parseInt(entry.timestampMs)));
})

let locs = [];
const locs2 = [];
locs = Object.keys(entries);

for (let i = 0; i < 1; i++){
  locs2.push(locs[i]);  
}

function getInfo(coord) {
  geo.find(coord, function (err, res) {
    if (err) console.error(err);   
    entries[coord].address = res.formatted_address;
    entries[coord].place_id = res.googleResponse.place_id;
  })
}
