// false for Mapquest, true for Google
const usingGoogle = true;
const Geocoder = usingGoogle ? require('google-geocoder') : require('mapquest-geocoder');
const { readFileSync, writeFileSync, createWriteStream } = require('fs');
const pLimit = require('p-limit');

const limit = pLimit(1);
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
    // split entries into sets of 100
    const sets = chunkArray(entries, 100);
    let count = 0;
    sets.forEach((set) => {
      writeFileSync(`./locations/unique${count}.json`, JSON.stringify(set, null, 2), { encoding: 'utf8' });
      count += 1;
    });
  }).catch((error) => {
    throw error;
  });
}

function getInfo(coord) {
  return new Promise((resolve, reject) => {
    const resolveRequest = (error, result) => {
      if (error) {
        reject(new Error('error resolving request: ', error));
      }
      resolve(result);
    };
    /* Google API */
    if (usingGoogle) {
      geo.find(coord, resolveRequest);
    } else {
    /* Mapquest API */
      geo.geocode(coord, resolveRequest);
    }
  }).catch((error) => {
    throw error;
  });
}
function rebuildDates(entries, entry) {
  return entries[entry].timeStamps.map(timeStamp => new Date(timeStamp));
}

function geoCodeFromUnique(data, outFile) {
  return new Promise((resolve, reject) => {
    Object.keys(data).forEach((index) => {
      data[index].timeStamps = rebuildDates(data, index);
    });
    resolve(data);
  }).then((entries) => {
    // limit concurrent requests
    limit(() => {
      const sharedheader = 'Date,Time,Latitude,Longitude,';
      const gheader = `${sharedheader}Place Id,Bldg Number, Street, City, County, State, Country, Zip, Post Route\n`;
      const mheader = `${sharedheader}Street, City, State, Country, Zip\n`;
      const header = usingGoogle ? gheader : mheader;
      const stream = createWriteStream(`./results/chrono${outFile}.csv`, { flags: 'a' });
      stream.write(header);
      const locs = [];
      Object.keys(entries).forEach((index) => {
        const entry = Object.assign(new Location(`${entries[index].lat}, ${entries[index].long}`), entries[index]);
        /*  Using Google API */
        if (usingGoogle) {
          getInfo(entry.coord) // billable $$$
            .then((info) => {
              entry.formatted_address = info[0].formatted_address;
              entry.address_components = info[0].googleResponse.address_components;
              entry.place_id = info[0].googleResponse.place_id;
            })
            .then(() => {
              // append to stream
              stream.write(entry.asChronologicalString());
            })
            .catch((error) => {
              if (error.message.code !== 'TypeError') {
                console.error('from getinfo:', error);
              }
            });
        }
        locs.push(entry.coord);
      });
      /* Using Mapquest API */
      if (!usingGoogle) {
        getInfo(locs) // billable $$$
          .then((info) => {
            for (let i = 0; i < info.received.length; i += 1) {
              const entry = Object.assign(new Location(`${entries[i].lat}, ${entries[i].long}`), entries[i]);
              entry.address_components = info.received[i][0].locations[0];
              stream.write(entry.asChronologicalString());
            }
          }).catch((error) => {
            throw error;
          });
      }
    }).catch((error) => {
      console.error(error);
    });
  });
}

function timer(ms) {
  return new Promise(res => setTimeout(res, ms));
}

async function run() {
  const end = 594; // set val to last unique${val}.json file
  let outFileIndex = 560; // set val to starting unique${val}.json file
  for (let i = outFileIndex; i < end; i += 1) {
    outFileIndex = i;
    const inFile = JSON.parse(readFileSync(`./locations/unique${i}.json`, 'utf8'));
    geoCodeFromUnique(inFile, outFileIndex);
    console.log(outFileIndex);
    await timer(10000); // rate limit, ~ 10 requests/sec
  }
}

// given Location History.json, generate unique location files
// getUniqueLocations(JSON.parse(readFileSync('Location History.json', 'utf8')));

// given unique location files, generate csv of geocoded data
run();
