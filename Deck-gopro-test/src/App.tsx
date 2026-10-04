import { useEffect, useState } from 'react'
import DeckGL from '@deck.gl/react'
import { HeatmapLayer } from '@deck.gl/aggregation-layers'
import { gps } from 'exifr'
import * as maplibregl from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { Map } from 'react-map-gl/maplibre'
import type { ViewState } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import './App.css'

maplibregl.setWorkerUrl(maplibreWorkerUrl)

type ImageLocation = {
  id: string
  longitude: number
  latitude: number
  label: string
  fileName: string
}

type GpsCoordinates = {
  latitude: number
  longitude: number
}

const exampleImageUrl = new URL('../GOPR0119.JPG', import.meta.url).href
const exampleGps: GpsCoordinates = {
  latitude: 37.3655157,
  longitude: -120.4220454,
}

const mapStyle = {
  version: 8 as const,
  sources: {
    openstreetmap: {
      type: 'raster' as const,
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [
    {
      id: 'openstreetmap',
      type: 'raster' as const,
      source: 'openstreetmap',
    },
  ],
}

const initialViewState: ViewState = {
  longitude: exampleGps.longitude,
  latitude: exampleGps.latitude,
  zoom: 11,
  pitch: 0,
  bearing: 0,
  padding: { top: 0, bottom: 0, left: 0, right: 0 },
}

function App() {
  const [imageLocation, setImageLocation] = useState<ImageLocation>({
    id: 'example-image',
    ...exampleGps,
    label: 'GOPR0119.JPG',
    fileName: 'GOPR0119.JPG',
  })
  const [previewUrl, setPreviewUrl] = useState(exampleImageUrl)
  const [status, setStatus] = useState('GPS coordinates loaded from the example image.')

  useEffect(() => {
    return () => {
      if (previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  async function handleImageChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0]
    if (!file) return

    setStatus('Reading GPS metadata...')

    try {
      const coordinates = await gps(file)
      if (
        !coordinates ||
        typeof coordinates.latitude !== 'number' ||
        typeof coordinates.longitude !== 'number'
      ) {
        setStatus('No GPS coordinates were found in this image.')
        return
      }

      setImageLocation({
        id: `${file.name}-${file.lastModified}`,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        label: file.name,
        fileName: file.name,
      })
      setPreviewUrl(URL.createObjectURL(file))
      setStatus('GPS coordinates loaded from the image.')
    } catch {
      setStatus('Could not read this image’s EXIF metadata.')
    }
  }

  const layers = [
    new HeatmapLayer<ImageLocation>({
      id: 'image-location-heatmap',
      data: [imageLocation],
      getPosition: (location) => [location.longitude, location.latitude],
      getWeight: () => 1,
      radiusPixels: 60,
      intensity: 1,
      threshold: 0.05,
    }),
  ]

  return (
    <main className="page">
      <section className="map-card" aria-labelledby="map-title">
        <div className="map-header">
          <div>
            <p className="eyebrow">Image location</p>
            <h1 id="map-title">Where was this image taken?</h1>
          </div>
          <label className="upload-button">
            Choose image
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              onChange={handleImageChange}
            />
          </label>
        </div>

        <div className="image-summary">
          <img src={previewUrl} alt={`Preview of ${imageLocation.fileName}`} />
          <div>
            <strong>{imageLocation.fileName}</strong>
            <p>{status}</p>
          </div>
        </div>

        <div className="map-wrapper">
          <DeckGL
            initialViewState={initialViewState}
            controller
            layers={layers}
            getTooltip={({ object }) =>
              object ? { text: object.label } : null
            }
          >
            <Map
              mapLib={maplibregl}
              mapStyle={mapStyle}
              attributionControl={{}}
            />
          </DeckGL>
        </div>

        <p className="map-caption">
          Pin location: {imageLocation.latitude.toFixed(6)},{' '}
          {imageLocation.longitude.toFixed(6)}
        </p>
      </section>
    </main>
  )
}

export default App
