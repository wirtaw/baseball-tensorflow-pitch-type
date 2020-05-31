import io from 'socket.io-client';
import config from '../config';
import './scss/main.scss';

const predictContainer = document.getElementById('predictContainer');
const predictButton = document.getElementById('predict-button');
const trainingProgress = document.getElementById('trainingProgress');

const socket =
  io(`http://localhost:${config.MAIN.PORT}`,
    {
      reconnectionDelay: config.MAIN.RECONNECTION_DELAY,
      reconnectionDelayMax: config.MAIN.RECONNECTION_DELAY_MAX,
    });

const testData = {
  vx0: 2.668,
  vy0: -114.333,
  vz0: -1.908,
  ax: 4.786,
  ay: 25.707,
  az: -45.21,
  startSpeed: 78,
  leftHandedPitcher: 0,
};
let testSample = Object.values(testData); // Curveball

predictButton.onclick = () => {
  predictButton.disabled = true;
  const form = document.querySelector('form');
  const formData = new FormData(form);

  let output = '';
  for (const entry of formData) {
    output = `${output}${entry[0]}=${entry[1]}\r`;
    let value = 0;
    if (entry[0].indexOf('data-sample-v') > -1 || entry[0].indexOf('data-sample-a') > -1) {
      value = parseFloat(entry[1]);
      testData[entry[0].replace('data-sample-', '')] = value;
    } else if (entry[0].indexOf('data-sample-speed') > -1 || entry[0].indexOf('data-sample-hand') > -1) {
      value = parseInt(entry[1], 10);

      if (entry[0].indexOf('data-sample-speed') > -1) {
        testData['startSpeed'] = value;
      }

      if (entry[0].indexOf('data-sample-hand') > -1) {
        testData['leftHandedPitcher'] = value;
      }
    }
  }
  // console.info(testSample);
  testSample = Object.values(testData);
  // console.info(output);
  // console.info(testSample);
  socket.emit('predictSample', testSample);
};

// functions to handle socket events
socket.on('connect', () => {
  document.getElementById('waiting-msg').style.display = 'none';
  document.getElementById('trainingStatus').innerHTML = 'Training in Progress';
  document.getElementById('trainingProgress').value = 0;
});

socket.on('predictStep', (value) => {
  document.getElementById('waiting-msg').style.display = 'none';
  document.getElementById('trainingStatus').innerHTML = 'Training in Progress';
  document.getElementById('trainingProgress').value = value;
});

socket.on('trainingComplete', () => {
  document.getElementById('trainingProgress').value = 100;

  document.getElementById('trainingStatus').innerHTML = 'Training Complete';
  document.getElementById('data-sample-vx0').value = testData.vx0;
  document.getElementById('data-sample-vy0').value = testData.vy0;
  document.getElementById('data-sample-vz0').value = testData.vz0;

  document.getElementById('data-sample-ax').value = testData.ax;
  document.getElementById('data-sample-ay').value = testData.ay;
  document.getElementById('data-sample-az').value = testData.az;

  document.getElementById('data-sample-speed').value = testData.startSpeed;

  const handRadios = document.getElementsByName('data-sample-hand');
  for (let i = 0; i < handRadios.length; i++) {
    if (handRadios[i].type === 'radio' && `${handRadios[i].value}` === `${testData.leftHandedPitcher}`) {
      handRadios[i].checked = true;
    }
  }

  predictContainer.style.display = 'block';
});

socket.on('predictResult', (result) => {
  plotPredictResult(result);
});

socket.on('disconnect', () => {
  document.getElementById('trainingStatus').innerHTML = '';
  predictContainer.style.display = 'none';
  document.getElementById('waiting-msg').style.display = 'block';
});

function plotPredictResult(result) {
  predictButton.disabled = false;
  document.getElementById('predictResult').innerHTML = result;
  console.info(result);
}