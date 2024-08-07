import { ReactiveController, ReactiveControllerHost } from 'lit';
import { SelectorController } from 'xstate-lit';
import { AxisType, View2dActor } from '@itk-viewer/viewer/view-2d.js';
import { TransferFunctionEditor } from '@itk-viewer/transfer-function-editor/TransferFunctionEditor.js';
import { ColorTransferFunction } from '@itk-viewer/transfer-function-editor/ColorTransferFunction.js';
import { Image, ImageSnapshot } from '@itk-viewer/viewer/image.js';
import { Subscription } from 'xstate';

type View2dSnapshot = ReturnType<View2dActor['getSnapshot']>;

export class View2dControls implements ReactiveController {
  host: ReactiveControllerHost;

  actor: View2dActor | undefined;
  viewSubscription: Subscription | undefined;
  imageSubscription: Subscription | undefined;
  imageActor: Image | undefined;
  scale: SelectorController<View2dActor, number> | undefined;
  scaleCount: SelectorController<View2dActor, number> | undefined;
  slice: SelectorController<View2dActor, number> | undefined;
  axis: SelectorController<View2dActor, AxisType> | undefined;
  imageDimension: SelectorController<View2dActor, number> | undefined;
  transferFunctionEditor: TransferFunctionEditor | undefined;

  constructor(host: ReactiveControllerHost) {
    this.host = host;
    host.addController(this);
  }

  hostConnected() {
    // no-op
  }

  setActor(actor: View2dActor) {
    this.actor = actor;

    this.scale = new SelectorController(
      this.host,
      this.actor,
      (state) => state.context.scale,
    );
    this.scaleCount = new SelectorController(this.host, this.actor, (state) => {
      const image = state.context.image;
      if (!image) return 1;
      return image.coarsestScale + 1;
    });
    this.slice = new SelectorController(
      this.host,
      this.actor,
      (state) => state.context.slice,
    );
    this.axis = new SelectorController(
      this.host,
      this.actor,
      (state) => state.context.axis,
    );
    this.imageDimension = new SelectorController(
      this.host,
      this.actor,
      (state) => state.context.image?.imageType.dimension ?? 0,
    );
    this.host.requestUpdate(); // trigger render with selected state

    // wire up Transfer Function Editor
    if (this.viewSubscription) this.viewSubscription.unsubscribe();
    this.viewSubscription = this.actor.subscribe(this.onViewSnapshot);
    this.onViewSnapshot(this.actor.getSnapshot());
  }

  onSlice(event: Event) {
    const target = event.target as HTMLInputElement;
    const slice = Number(target.value);
    this.actor!.send({
      type: 'setSlice',
      slice,
    });
  }

  onAxis(event: Event) {
    const target = event.target as HTMLInputElement;
    const axis = target.value as AxisType;
    this.actor!.send({
      type: 'setAxis',
      axis,
    });
  }

  onScale(event: Event) {
    const target = event.target as HTMLInputElement;
    const scale = Number(target.value);
    this.actor!.send({ type: 'setScale', scale });
  }

  setTransferFunctionContainer(container: Element | undefined) {
    if (container) {
      this.transferFunctionEditor = new TransferFunctionEditor(container);

      this.transferFunctionEditor.setColorTransferFunction(
        new ColorTransferFunction(),
      );
      this.transferFunctionEditor.setRangeViewOnly(true);

      this.transferFunctionEditor.eventTarget.addEventListener(
        'colorRange',
        (e) => {
          const range = (<CustomEvent>e).detail as [number, number];
          this.imageActor?.send({
            type: 'normalizedColorRange',
            range,
            component: 0,
          });
        },
      );
    }
  }

  onViewSnapshot = (snapshot: View2dSnapshot) => {
    const { imageActor } = snapshot.context;
    if (this.imageActor !== imageActor) {
      this.imageSubscription?.unsubscribe();
    }
    this.imageActor = imageActor;
    // If imageActor exists and there's no subscription, subscribe to it.
    if (this.imageActor && !this.imageSubscription) {
      this.imageSubscription = this.imageActor.subscribe(
        this.onImageActorSnapshot,
      );
      this.onImageActorSnapshot(this.imageActor.getSnapshot());
    }
  };

  onImageActorSnapshot = (snapshot: ImageSnapshot) => {
    const component = 0;
    const { dataRanges, normalizedColorRanges } = snapshot.context;
    if (dataRanges.length === 0) return;
    this.transferFunctionEditor?.setRange(dataRanges[component]);
    if (normalizedColorRanges.length === 0) return;
    const currentColorRange = this.transferFunctionEditor?.getColorRange();
    // avoid infinite loop
    const noChange = currentColorRange?.every(
      (v, i) => v === normalizedColorRanges[component][i],
    );
    if (noChange) return;

    this.transferFunctionEditor?.setColorRange(
      normalizedColorRanges[component],
    );
  };
}
