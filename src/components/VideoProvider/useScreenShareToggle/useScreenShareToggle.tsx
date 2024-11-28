import { useState, useCallback, useRef } from 'react';
import { LogLevels, Track, Room } from 'twilio-video';
import { ErrorCallback } from '../../../types';
import { useAppState } from '../../../state';

interface MediaStreamTrackPublishOptions {
  name?: string;
  priority: Track.Priority;
  logLevel: LogLevels;
}

export default function useScreenShareToggle(room: Room | null, onError: ErrorCallback) {
  const [isSharing, setIsSharing] = useState(false);
  const stopScreenShareRef = useRef<() => void>(null!);
  const { settings } = useAppState();

  const shareScreen = useCallback(() => {
    let videoSettings;
    if (settings.screenShareResolution === 'Source') {
      // Use source resolution
      videoSettings = true;
    } else if (settings.screenShareResolution === '1080p') {
      // Request resolution close to 1080 vertical pixels
      videoSettings = {
        height: { ideal: 1080 },
      };
    } else if (settings.screenShareResolution === '720p') {
      // Request resolution close to 720 vertical pixels
      videoSettings = {
        height: { ideal: 720 },
      };
    }

    navigator.mediaDevices
      .getDisplayMedia({
        audio: false,
        video: videoSettings,
      })
      .then(stream => {
        const track = stream.getTracks()[0];

        // All video tracks are published with 'low' priority. This works because the video
        // track that is displayed in the 'MainParticipant' component will have it's priority
        // set to 'high' via track.setPriority()
        room!.localParticipant
          .publishTrack(track, {
            name: 'screen', // Tracks can be named to easily find them later
            priority: 'low', // Priority is set to high by the subscriber when the video track is rendered
          } as MediaStreamTrackPublishOptions)
          .then(trackPublication => {
            stopScreenShareRef.current = () => {
              room!.localParticipant.unpublishTrack(track);
              // TODO: remove this if the SDK is updated to emit this event
              room!.localParticipant.emit('trackUnpublished', trackPublication);
              track.stop();
              setIsSharing(false);
            };

            track.onended = stopScreenShareRef.current;
            setIsSharing(true);
          })
          .catch(onError);
      })
      .catch(error => {
        // Don't display an error if the user closes the screen share dialog
        if (
          error.message === 'Permission denied by system' ||
          (error.name !== 'AbortError' && error.name !== 'NotAllowedError')
        ) {
          console.error(error);
          onError(error);
        }
      });
  }, [room, onError]);

  const toggleScreenShare = useCallback(() => {
    if (room) {
      !isSharing ? shareScreen() : stopScreenShareRef.current();
    }
  }, [isSharing, shareScreen, room]);

  return [isSharing, toggleScreenShare] as const;
}
