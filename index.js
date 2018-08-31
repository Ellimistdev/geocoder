// false for Mapquest, true for Google
const usingGoogle = false;
const Geocoder = usingGoogle ? require('google-geocoder') : require('mapquest-geocoder');
const { readFileSync, writeFileSync, createWriteStream } = require('fs');

const keyPath = usingGoogle ? 'google.key' : 'mapquest5.key';
const key = readFileSync(keyPath, 'utf8');
const geo = usingGoogle ? Geocoder({ key }) : new Geocoder(key);

class Location {
  constructor(lat, long) {
    this.lat = lat;
    this.long = long;
    this.coord = `${lat}, ${long}`;
    this.timeStamps = [];
    this.formatted_address = null;
    this.place_id = null;
    this.address_components = null;
  }

  asChronologicalString() {
    let result = '';
    this.timeStamps.forEach(((timeStamp) => {
      let str = `${timeStamp.toDateString()},${timeStamp.toTimeString()}`;
      str += `,${this.lat},${this.long}`;
      /* google */
      if (usingGoogle) {
        str += `,${this.place_id}`;
        this.address_components.forEach((el) => {
        // for (const el of this.address_components) {
          str += `,${el.long_name}`;
        });
      } else {
      /* mapquest */
        const components = this.address_components;
        str += `,${components.street},${components.adminArea5},${components.adminArea3},${components.adminArea1},${components.postalCode}`;
      }
      result += `${str}\n`;
    }));
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
  entries[coord].timeStamps.push(new Date(parseInt(entry.timestampMs, 10)));
}

function chunkArray(entries, size) {
  const arr = [];
  const vals = Object.values(entries);
  const length = Object.keys(entries).length;
  for (let i = 0; i < length; i += size) {
    const a = vals.slice(i, i + size);
    arr.push(a);
  }
  return arr;
}

function getUniqueLocations(data) {
  return new Promise((resolve) => {
    const entries = {};
    data.locations.forEach((entry) => {
      createEntries(entries, entry);
    });
    resolve(entries);
  }).then((entries) => {
    // split entires into sets of 5k
    const sets = chunkArray(entries, 5000);
    let count = 0;
    sets.forEach((set) => {
      writeFileSync(`unique${count}.json`, JSON.stringify(set, null, 2), { encoding: 'utf8' });
      count += 1;
    });
  }).catch((error) => {
    console.error(error);
  });
}

function getInfo(coord) {
  return new Promise((resolve) => {
    const resolveRequest = (err, res) => {
      if (err) throw err;
      resolve(res);
    };
    /* Google API */
    if (usingGoogle) {
      geo.find(coord, resolveRequest);
    } else {
    /* Mapquest API */
      geo.geocode(coord, resolveRequest);
    }
  });
}
function rebuildDates(entries, entry) {
  return entries[entry].timeStamps.map(timeStamp => new Date(timeStamp));
}

function geoCodeFromUnique(data) {
  return new Promise((resolve) => {
    Object.keys(data).forEach((index) => {
      data[index].timeStamps = rebuildDates(data, index);
    });
    resolve(data);
  }).then((entries) => {
    const gheader = 'Date,Time,Place Id,Latitude,Longitude,Bldg Number, Street, City, County, State, Country, Zip, Post Route\n';
    const mheader = 'Date,Time,Latitude,Longitude,Street, City, State, Country, Zip\n';
    const header = usingGoogle ? gheader : mheader;
    const stream = createWriteStream('chrono.csv', { flags: 'a' });
    stream.write(header);
    const locs = [];
    Object.keys(entries).forEach((index) => {
      const coord = `${entries[index].coord}`;
      /*  Using Google API */
      if (usingGoogle) {
        getInfo(coord) // billable $$$
          .then((info) => {
            entries[index].formatted_address = info[0].formatted_address;
            entries[index].address_components = info[0].googleResponse.address_components;
            entries[index].place_id = info[0].googleResponse.place_id;
            return entries;
          })
          .then((entry) => {
            // append to stream
            stream.write(entries[entry].asChronologicalString());
          });
      }
      locs.push(coord);
    });
    /* Using Mapquest API */
    if (!usingGoogle) {
      getInfo(locs) // billable $$$
        .then((info) => {
          for (let i = 0; i < info.received.length; i += 1) {
            entries[i].address_components = info.received[i][0].locations[0];
            const entry = Object.assign(new Location(`${entries[i].lat}, ${entries[i].long}`), entries[i]);
            stream.write(entry.asChronologicalString());
          }
          return entries;
        });
    }
  }).catch((error) => {
    console.error(error);
  });
}

// given Location History.json, generate unique location files
// getUniqueLocations(JSON.parse(readFileSync('Location History.json', 'utf8')));
// given unique location files, generate csv of geocoded data
geoCodeFromUnique(JSON.parse(readFileSync('unique0.json', 'utf8')));
