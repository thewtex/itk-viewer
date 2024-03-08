import * as Comlink from 'comlink';

const updateHistogram = ({
  values,
  min,
  max,
  numberOfBins,
  component = 0,
  numberOfComponents = 1,
}) => {
  const offset = component;
  const step = numberOfComponents;

  const delta = max - min;
  const histogram = new Float32Array(numberOfBins);
  histogram.fill(0);
  const len = values.length;
  for (let i = offset; i < len; i += step) {
    const idx = Math.floor(
      ((numberOfBins - 1) * (Number(values[i]) - min)) / delta,
    );
    histogram[idx] += 1;
  }

  return Comlink.transfer(histogram, [histogram.buffer]);
};

Comlink.expose({
  updateHistogram,
});
