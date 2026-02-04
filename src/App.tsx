import { useEffect, useRef, useState, type DragEvent } from 'react'
import './App.css'

type Point = { x: number; y: number }

type Piece = {
  id: string
  label: string
  slot: number
}

type Edges = {
  top: number
  right: number
  bottom: number
  left: number
}

const ROWS = 4
const COLS = 4

const pieces: Piece[] = Array.from({ length: 16 }, (_, index) => ({
  id: `p${index + 1}`,
  label: String(index + 1),
  slot: index
}))

const ASSET_BASE = import.meta.env.BASE_URL
const pictureUrl = `${ASSET_BASE}picture.jpg`
const explosionUrl = `${ASSET_BASE}explosion.gif`

const tabRadius = 22
const svgViewBox = `${-tabRadius} ${-tabRadius} ${100 + tabRadius * 2} ${100 + tabRadius * 2}`
const svgScale = (100 + tabRadius * 2) / 100

const arc = (r: number, sweep: number, x: number, y: number) =>
  `A ${r} ${r} 0 0 ${sweep} ${x} ${y}`

const edgePathTop = (edge: number) => {
  if (edge === 0) return 'L 100 0'
  const r = tabRadius
  const sweep = edge === 1 ? 1 : 0
  return `L ${50 - r} 0 ${arc(r, sweep, 50 + r, 0)} L 100 0`
}

const edgePathRight = (edge: number) => {
  if (edge === 0) return 'L 100 100'
  const r = tabRadius
  const sweep = edge === 1 ? 0 : 1
  return `L 100 ${50 - r} ${arc(r, sweep, 100, 50 + r)} L 100 100`
}

const edgePathBottom = (edge: number) => {
  if (edge === 0) return 'L 0 100'
  const r = tabRadius
  const sweep = edge === 1 ? 1 : 0
  return `L ${50 + r} 100 ${arc(r, sweep, 50 - r, 100)} L 0 100`
}

const edgePathLeft = (edge: number) => {
  if (edge === 0) return 'L 0 0'
  const r = tabRadius
  const sweep = edge === 1 ? 0 : 1
  return `L 0 ${50 + r} ${arc(r, sweep, 0, 50 - r)} L 0 0`
}

const buildPiecePath = (edges: Edges) =>
  `M 0 0 ${edgePathTop(edges.top)} ${edgePathRight(edges.right)} ${edgePathBottom(
    edges.bottom
  )} ${edgePathLeft(edges.left)} Z`

const maskBounds = (radius: number) => ({
  x: -radius,
  y: -radius,
  width: 100 + radius * 2,
  height: 100 + radius * 2
})

const getPieceCoords = (slot: number) => ({
  row: Math.floor(slot / COLS),
  col: slot % COLS
})

const imagePattern = (piece: Piece) => {
  const { row, col } = getPieceCoords(piece.slot)
  const imageSize = 100 * COLS
  return {
    id: `img-${piece.id}`,
    width: imageSize,
    height: imageSize,
    x: -col * 100,
    y: -row * 100
  }
}

const getEdges = (row: number, col: number): Edges => {
  const tab = (r: number, c: number) => ((r + c) % 2 === 0 ? 1 : -1)
  return {
    top: row === 0 ? 0 : tab(row - 1, col),
    right: col === COLS - 1 ? 0 : tab(row, col),
    bottom: row === ROWS - 1 ? 0 : -tab(row, col),
    left: col === 0 ? 0 : -tab(row, col - 1)
  }
}

function App() {
  const stageRef = useRef<HTMLElement | null>(null)
  const [placed, setPlaced] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(pieces.map((piece) => [piece.id, false]))
  )
  const [scatter, setScatter] = useState<Record<string, { start: Point; tilt: number }>>(
    () => Object.fromEntries(pieces.map((piece) => [piece.id, { start: { x: 0, y: 0 }, tilt: 0 }]))
  )
  const [showExplosion, setShowExplosion] = useState(false)
  const explosionTimer = useRef<number | null>(null)
  const isComplete = Object.values(placed).every(Boolean)
  const piecesById = Object.fromEntries(pieces.map((piece) => [piece.id, piece]))

  useEffect(() => {
    return () => {
      if (explosionTimer.current) window.clearTimeout(explosionTimer.current)
    }
  }, [])

  useEffect(() => {
    const generateScatter = () => {
      if (!stageRef.current) return
      const rect = stageRef.current.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      const pieceSize = window.innerWidth <= 700 ? 86 : 96
      const pieceVisualSize = pieceSize * svgScale
      const minDistance = pieceVisualSize * 1.1
      const padding = 48
      const minX = padding + pieceVisualSize / 2 - centerX
      const maxX = window.innerWidth - padding - pieceVisualSize / 2 - centerX
      const minY = padding + pieceVisualSize / 2 - centerY
      const maxY = window.innerHeight - padding - pieceVisualSize / 2 - centerY
      const safeMinX = minX <= maxX ? minX : (minX + maxX) / 2
      const safeMaxX = minX <= maxX ? maxX : (minX + maxX) / 2
      const safeMinY = minY <= maxY ? minY : (minY + maxY) / 2
      const safeMaxY = minY <= maxY ? maxY : (minY + maxY) / 2
      const rand = (min: number, max: number) => min + Math.random() * (max - min)

      const positions: Array<{ x: number; y: number; tilt: number }> = []
      const maxAttempts = 600

      pieces.forEach(() => {
        let placed = false
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          const candidate = {
            x: rand(safeMinX, safeMaxX),
            y: rand(safeMinY, safeMaxY),
            tilt: rand(-14, 14)
          }
          const clear = positions.every((pos) => {
            const dx = pos.x - candidate.x
            const dy = pos.y - candidate.y
            return Math.hypot(dx, dy) >= minDistance
          })
          if (clear) {
            positions.push(candidate)
            placed = true
            break
          }
        }
        if (!placed) {
          positions.push({
            x: rand(safeMinX, safeMaxX),
            y: rand(safeMinY, safeMaxY),
            tilt: rand(-14, 14)
          })
        }
      })

      setScatter(
        Object.fromEntries(
          pieces.map((piece, index) => [
            piece.id,
            {
              start: { x: positions[index].x, y: positions[index].y },
              tilt: positions[index].tilt
            }
          ])
        )
      )
    }

    generateScatter()
    window.addEventListener('resize', generateScatter)
    return () => window.removeEventListener('resize', generateScatter)
  }, [])

  const handleDragStart = (event: DragEvent<HTMLButtonElement>, id: string) => {
    event.dataTransfer.setData('text/plain', id)
    event.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>, slotIndex: number) => {
    event.preventDefault()
    const id = event.dataTransfer.getData('text/plain')
    if (!id || placed[id]) return
    const piece = piecesById[id]
    if (!piece || piece.slot !== slotIndex) return
    setPlaced((current) => ({ ...current, [id]: true }))
  }

  const handleExplosion = () => {
    if (explosionTimer.current) window.clearTimeout(explosionTimer.current)
    setShowExplosion(true)
    explosionTimer.current = window.setTimeout(() => setShowExplosion(false), 1400)
  }

  return (
    <div className={`page ${isComplete ? 'complete' : ''}`}>
      <section className="puzzle-stage" aria-label="Puzzle" ref={stageRef}>
        {isComplete ? (
          <div className="completion-banner" aria-live="polite">
            <span>Will you be my Valentine?</span>
          </div>
        ) : null}
        <div className="puzzle-board" aria-label="Puzzle board">
          <div className="board-highlight" />
          <div className="board-inner">
            <div className="board-picture" />
            {isComplete && showExplosion ? (
              <img
                className="explosion"
                src={explosionUrl}
                alt=""
                aria-hidden="true"
              />
            ) : null}
            <div className="board-grid">
              {pieces.map((piece) => (
                <div
                  key={`slot-${piece.id}`}
                  className={`slot ${placed[piece.id] ? 'filled' : ''}`}
                  style={{ order: piece.slot }}
                  onDragOver={handleDragOver}
                  onDrop={(event) => handleDrop(event, piece.slot)}
                >
                  {placed[piece.id] ? (
                    <button
                      type="button"
                      className="piece placed"
                      aria-pressed
                    >
                      <svg
                        className="piece-svg"
                        viewBox={svgViewBox}
                        aria-hidden="true"
                        style={{ transform: `scale(${svgScale})` }}
                      >
                        <defs>
                          <linearGradient
                            id={`grad-${piece.id}`}
                            x1="0"
                            y1="0"
                            x2="1"
                            y2="1"
                          >
                            <stop offset="0%" stopColor="#fff6f2" />
                            <stop offset="100%" stopColor="#ffe2e7" />
                          </linearGradient>
                          <pattern
                            id={imagePattern(piece).id}
                            patternUnits="userSpaceOnUse"
                            width={imagePattern(piece).width}
                            height={imagePattern(piece).height}
                            x={imagePattern(piece).x}
                            y={imagePattern(piece).y}
                          >
                            <image
                              href={pictureUrl}
                              x="0"
                              y="0"
                              width={imagePattern(piece).width}
                              height={imagePattern(piece).height}
                              preserveAspectRatio="xMidYMid slice"
                            />
                          </pattern>
                          <clipPath
                            id={`clip-${piece.id}`}
                            clipPathUnits="userSpaceOnUse"
                          >
                            <path
                              d={buildPiecePath(
                                getEdges(
                                  Math.floor(piece.slot / COLS),
                                  piece.slot % COLS
                                )
                              )}
                            />
                          </clipPath>
                        </defs>
                        {(() => {
                          const bounds = maskBounds(tabRadius)
                          return (
                            <rect
                              x={bounds.x}
                              y={bounds.y}
                              width={bounds.width}
                              height={bounds.height}
                              fill={`url(#${imagePattern(piece).id})`}
                              clipPath={`url(#clip-${piece.id})`}
                            />
                          )
                        })()}
                        <path
                          className="piece-path placed"
                          d={buildPiecePath(
                            getEdges(
                              Math.floor(piece.slot / COLS),
                              piece.slot % COLS
                            )
                          )}
                          fill="none"
                        />
                      </svg>
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="pieces">
          {pieces
            .filter((piece) => !placed[piece.id])
            .map((piece) => (
              <button
                key={piece.id}
                type="button"
                className="piece"
                draggable
                onDragStart={(event) => handleDragStart(event, piece.id)}
                style={{
                  transform: `translate(${scatter[piece.id].start.x}px, ${scatter[piece.id].start.y}px) rotate(${scatter[piece.id].tilt}deg)`
                }}
                aria-pressed={placed[piece.id]}
              >
                <svg
                  className="piece-svg"
                  viewBox={svgViewBox}
                  aria-hidden="true"
                  style={{ transform: `scale(${svgScale})` }}
                >
                  <defs>
                    <linearGradient id={`grad-${piece.id}`} x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#ffffff" />
                      <stop offset="100%" stopColor="#ffe7ec" />
                    </linearGradient>
                    <pattern
                      id={imagePattern(piece).id}
                      patternUnits="userSpaceOnUse"
                      width={imagePattern(piece).width}
                      height={imagePattern(piece).height}
                      x={imagePattern(piece).x}
                      y={imagePattern(piece).y}
                    >
                      <image
                        href={pictureUrl}
                        x="0"
                        y="0"
                        width={imagePattern(piece).width}
                        height={imagePattern(piece).height}
                        preserveAspectRatio="xMidYMid slice"
                      />
                    </pattern>
                    <clipPath
                      id={`clip-${piece.id}`}
                      clipPathUnits="userSpaceOnUse"
                    >
                      <path
                        d={buildPiecePath(
                          getEdges(Math.floor(piece.slot / COLS), piece.slot % COLS)
                        )}
                      />
                    </clipPath>
                  </defs>
                  {(() => {
                    const bounds = maskBounds(tabRadius)
                    return (
                      <rect
                        x={bounds.x}
                        y={bounds.y}
                        width={bounds.width}
                        height={bounds.height}
                        fill={`url(#${imagePattern(piece).id})`}
                        clipPath={`url(#clip-${piece.id})`}
                      />
                    )
                  })()}
                  <path
                    className="piece-path"
                    d={buildPiecePath(
                      getEdges(Math.floor(piece.slot / COLS), piece.slot % COLS)
                    )}
                    fill="none"
                  />
                </svg>
              </button>
            ))}
        </div>
      </section>
      <div className={`celebration ${isComplete ? 'show' : ''}`} aria-hidden="true">
        <div className="heart heart-1" />
        <div className="heart heart-2" />
        <div className="heart heart-3" />
        <div className="heart heart-4" />
        <div className="heart heart-5" />
        <div className="heart heart-6" />
        <div className="heart heart-7" />
        <button
          type="button"
          className="floater-emoji"
          onClick={handleExplosion}
          aria-label="Explosion"
        >
          😡
        </button>
      </div>
    </div>
  )
}

export default App
