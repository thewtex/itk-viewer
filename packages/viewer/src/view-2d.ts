import { Actor, assign, fromPromise, sendParent, sendTo, setup } from 'xstate';
import {
  MultiscaleSpatialImage,
  BuiltImage,
} from '@itk-viewer/io/MultiscaleSpatialImage.js';
import { viewportMachine } from './viewport-machine.js';

const context = {
  slice: 0,
  scale: 0,
};

export const view2d = setup({
  types: {} as {
    context: typeof context;
    events:
      | { type: 'setImage' }
      | { type: 'imageAssigned'; image: MultiscaleSpatialImage }
      | { type: 'setSlice'; slice: number }
      | { type: 'setScale'; scale: number };
  },
  actors: {
    viewport: viewportMachine,
    imageBuilder: fromPromise(
      async ({
        input: { image, scale, slice },
      }: {
        input: {
          image: MultiscaleSpatialImage;
          scale: number;
          slice: number;
        };
      }) => {
        const worldBounds = await image.getWorldBounds(scale);
        const zWidth = worldBounds[5] - worldBounds[4];
        const worldZ = worldBounds[4] + zWidth * slice;
        worldBounds[4] = worldZ;
        worldBounds[5] = worldZ;
        const builtImage = await image.getImage(scale, worldBounds);
        return builtImage as BuiltImage;
      },
    ),
  },
}).createMachine({
  context: () => JSON.parse(JSON.stringify(context)),
  id: 'view2d',
  type: 'parallel',
  states: {
    viewport: {
      invoke: {
        id: 'viewport',
        src: 'viewport',
      },
    },
    view2d: {
      on: {
        setImage: {
          actions: [sendTo('viewport', ({ event }) => event)],
        },
        imageAssigned: {
          actions: [
            assign({
              scale: ({ event }) => event.image.coarsestScale,
              slice: () => {
                return 0;
              },
            }),
          ],
          target: '.buildingImage',
        },
        setSlice: {
          actions: [assign({ slice: ({ event }) => event.slice })],
          target: '.buildingImage',
        },
        setScale: {
          actions: [assign({ scale: ({ event }) => event.scale })],
          target: '.buildingImage',
        },
      },
      initial: 'idle',
      states: {
        idle: {},
        buildingImage: {
          invoke: {
            input: ({ context, self }) => {
              const { image } = self
                .getSnapshot()
                .children.viewport.getSnapshot().context;
              return {
                image,
                scale: context.scale,
                slice: context.slice,
              };
            },
            src: 'imageBuilder',
            onDone: {
              actions: [
                sendParent(({ event: { output } }) => {
                  return {
                    type: 'imageBuilt',
                    image: output,
                  };
                }),
              ],
            },
          },
        },
      },
    },
  },
});

export type View2dActor = Actor<typeof view2d>;
