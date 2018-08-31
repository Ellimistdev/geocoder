// const GoogleGeocoder = require('google-geocoder');
const MapquestGeocoder = require('mapquest-geocoder');
const { readFileSync, writeFileSync, createWriteStream } = require('fs');

// const key = readFileSync('google.key', 'utf8');
// const googleGeo = GoogleGeocoder({key: key});
const key = readFileSync('mapquest0.key', 'utf8');
const mapquestGeo = new MapquestGeocoder(key);

class Location {
  constructor(lat, long) {
    this.lat = lat;
    this.long = long;
    this.timeStamps = [];
    this.formatted_address = null;
    this.place_id = null;
    this.address_components = null;
  }

  asChronologicalString() {
    let result = '';
    for (const timeStamp of this.timeStamps) {
      let str = `${timeStamp.toDateString()},${timeStamp.toTimeString()}`;
      // if using google api
      // str += `,${this.place_id}`;
      str += `,${this.lat},${this.long}`;
      /* google */
      /*
        for (const el of this.address_components) {
          str += `,${el.long_name}`;
        }
        */
      /* mapquest */
      const components = this.address_components;
      str += `,${components.street},${components.adminArea5},${components.adminArea3},${components.adminArea1},${components.postalCode}`;
      result += `${str}\n`;
    }
    return result;
  }
}

function createEntries(entries, entry) {
  const lat = entry.latitudeE7 / 1E7;
  const long = entry.longitudeE7 / 1E7;
  const coord = `${lat}, ${long}`;
  if (!entries[coord]) {
    entries[coord] = new Location(lat, long);
  }
  entries[coord].timeStamps.push(new Date(parseInt(entry.timestampMs)));
}

function chunkArray(entries, size) {
  const arr = [];
  const vals = Object.values(entries);
  entries.length = Object.keys(entries).length;
  for (let i = 0; i < entries.length; i += size) {
    const a = vals.slice(i, i + size);
    arr.push(a);
  }
  return arr;
}

function getUniqueLocations(data) {
  return new Promise((resolve) => {
    let entries = {};
    data.locations.forEach((entry) => {
      createEntries(entries, entry);
    });
    resolve(entries);
  }).then((entries) => {
    // split entires into sets of 14k
    const sets = chunkArray(entries, 14000);
    let count = 0;
    for (const set in sets) {
      writeFileSync(`unique${count}.json`, JSON.stringify(sets[set], null, 2), { encoding: 'utf8' });
      count += 1;
    }
    const loc = Object.keys(entries);
    console.log(loc.length);
  }).catch((error) => {
    console.error(error);
  });
}

function getInfo(coord) {
  return new Promise((resolve) => {
    /* Google API */
    /*
    googleGeo.find(coord, function (err, res) {
      if (err) console.error(err);
      resolve(res);
    })
    */
    /* Mapquest API */
    mapquestGeo.geocode(coord, function (err, res) {
      if (err) throw err;
      resolve(res);
    });
  });
}
function rebuildDates(entries, entry) {
  return entries[entry].timeStamps.map(timeStamp => new Date(timeStamp));
}

function geoCodeFromUnique(data) {
  return new Promise((resolve) => {
    let entries = data;
    for (const entry in entries) {
      entries[entry].timeStamps = rebuildDates(entries, entry);
    }
    resolve(entries);
  }).then((entries) => {
    // const gheader =`Date,Time,Place Id,Latitude,Longitude,Bldg Number, Street, City, County, State, Country, Zip, Post Route\n`;
    const mheader = 'Date,Time,Latitude,Longitude,Street, City, State, Country, Zip\n';
    const header = mheader;
    const stream = createWriteStream('chrono.csv', { flags: 'a' });
    stream.write(header);
    const locs = [];
    for (const entry in entries) {
      const coord = `${entries[entry].lat}, ${entries[entry].long}`;
      /*  Using Google API */
      /*
        getInfo(coord) // billable $$$
          .then(info => {
            entries[entry].formatted_address = info[0].formatted_address;
            entries[entry].address_components = info[0].googleResponse.address_components;
            entries[entry].place_id = info[0].googleResponse.place_id;  return entries;
          })
          /*
          .then(entry => {
            // append to stream
            stream.write(entries[entry].asChronologicalString());
          })
        */
      /* Using Mapquest API */
      locs.push(coord);
    }
    getInfo(locs) // billable $$$
      .then((info) => {
        for (let i = 0; i < info.received.length; i += 1) {
          entries[i].address_components = info.received[i][0].locations[0];
          const entry = Object.assign(new Location(`${entries[i].lat}, ${entries[i].long}`), entries[i]);
          stream.write(entry.asChronologicalString());
        }
        return entries;
      });
  }).catch((error) => {
    console.error(error);
  });
}
// getUniqueLocations(JSON.parse(readFileSync('Location History.json', 'utf8')));
geoCodeFromUnique(JSON.parse(readFileSync('unique0.json', 'utf8')));
