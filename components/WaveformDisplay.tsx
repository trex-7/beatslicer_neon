import React, { useRef, useEffect, useState } from 'react';
import type { Slice, SequencerState } from '../types';
import Tooltip from './Tooltip';

declare const d3: any; // Using d3 from CDN

interface WaveformDisplayProps {
    audioBuffer: any; // Tone.AudioBuffer
    onScrub: (position: number) => void;
    isPlaying: boolean;
    playerRef: React.RefObject<any> | null;
    slices: Slice[];
    sequencer: SequencerState;
    selectedSliceIndex: number | null;
    onSliceSelect: (index: number) => void;
    onSliceToggle: (index: number) => void;
    onRegionSlice: (start: number, end: number) => void;
    onAutoSlice?: () => void;
}

const WaveformDisplay: React.FC<WaveformDisplayProps> = ({ 
    audioBuffer, 
    onScrub, 
    isPlaying, 
    playerRef, 
    slices, 
    sequencer, 
    selectedSliceIndex,
    onSliceSelect,
    onSliceToggle,
    onRegionSlice
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const [zoom, setZoom] = useState(1);
    const [containerWidth, setContainerWidth] = useState(0);

    // Drag Selection State
    const [dragStart, setDragStart] = useState<number | null>(null);
    const [dragCurrent, setDragCurrent] = useState<number | null>(null);

    // Handle container resize
    useEffect(() => {
        const resizeObserver = new ResizeObserver(entries => {
            if (!entries || !entries.length) return;
            const { width } = entries[0].contentRect;
            setContainerWidth(width);
        });

        if (containerRef.current) {
            resizeObserver.observe(containerRef.current);
        }

        return () => resizeObserver.disconnect();
    }, []);

    // Drag Logic
    useEffect(() => {
        const handleWindowMouseMove = (e: MouseEvent) => {
            if (dragStart !== null && svgRef.current) {
                 const rect = svgRef.current.getBoundingClientRect();
                 // Calculate X relative to SVG content
                 let x = e.clientX - rect.left;
                 // Clamp to visible width
                 x = Math.max(0, Math.min(x, rect.width));
                 setDragCurrent(x);
            }
        };

        const handleWindowMouseUp = (e: MouseEvent) => {
             if (dragStart !== null && svgRef.current && audioBuffer) {
                 const rect = svgRef.current.getBoundingClientRect();
                 let currentX = e.clientX - rect.left;
                 currentX = Math.max(0, Math.min(currentX, rect.width));
                 
                 const startX = Math.min(dragStart, currentX);
                 const endX = Math.max(dragStart, currentX);
                 
                 // Only trigger slice if drag distance is significant (> 5px)
                 // This prevents accidental slices when clicking to select existing slices
                 if (endX - startX > 5) {
                     const totalWidth = rect.width; 
                     const startTime = (startX / totalWidth) * audioBuffer.duration;
                     const endTime = (endX / totalWidth) * audioBuffer.duration;
                     onRegionSlice(startTime, endTime);
                 }
                 
                 setDragStart(null);
                 setDragCurrent(null);
             }
        };

        if (dragStart !== null) {
            window.addEventListener('mousemove', handleWindowMouseMove);
            window.addEventListener('mouseup', handleWindowMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleWindowMouseMove);
            window.removeEventListener('mouseup', handleWindowMouseUp);
        };
    }, [dragStart, audioBuffer, onRegionSlice]);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!audioBuffer) return;
        // Only start drag if we clicked directly on the SVG (not a child that stopped propagation)
        const rect = svgRef.current!.getBoundingClientRect();
        const x = e.clientX - rect.left;
        setDragStart(x);
        setDragCurrent(x);
    };

    // Initialize Layers (Run once)
    useEffect(() => {
        if (!svgRef.current) return;
        const svg = d3.select(svgRef.current);
        
        // Setup Defs and Layers if they don't exist
        if (svg.select("#defs-layer").empty()) {
            const defs = svg.append("defs").attr("id", "defs-layer");
            
            defs.append("linearGradient")
                .attr("id", "waveform-gradient")
                .attr("x1", "0%").attr("y1", "0%")
                .attr("x2", "100%").attr("y2", "0%") 
                .selectAll("stop")
                .data([
                    {offset: "0%", color: "#00f6ff"},
                    {offset: "100%", color: "#ff00aa"}
                ])
                .enter().append("stop")
                .attr("offset", d => d.offset)
                .attr("stop-color", d => d.color);
            
            // Pattern for disabled slices
            defs.append("pattern")
                .attr("id", "disabled-pattern")
                .attr("patternUnits", "userSpaceOnUse")
                .attr("width", 10)
                .attr("height", 10)
                .append("path")
                .attr("d", "M-1,1 l2,-2 M0,10 l10,-10 M9,11 l2,-2")
                .attr("stroke", "#ff00aa")
                .attr("stroke-width", 1);

            // Layer order determines z-index
            svg.append("g").attr("id", "waveform-layer");
            svg.append("g").attr("id", "slices-layer");
            svg.append("g").attr("id", "playback-layer");
            svg.append("g").attr("id", "selection-layer"); // Add selection layer on top
        }
    }, []);

    // 1. Draw Waveform (Heavy Computation)
    useEffect(() => {
        if (!audioBuffer || !svgRef.current || containerWidth === 0) return;

        const svg = d3.select(svgRef.current);
        const layer = svg.select("#waveform-layer");
        layer.selectAll("*").remove();

        const totalWidth = containerWidth * zoom;
        const height = 192; // Match the new h-48 (12rem * 16 = 192px)

        const channelData = audioBuffer.getChannelData(0);
        const samples = Math.floor(channelData.length / totalWidth);
        
        // Downsample for display
        const downsampledData: number[] = [];
        for (let i = 0; i < totalWidth; i++) {
            let max = 0;
            const step = Math.max(1, Math.floor(samples));
            for (let j = 0; j < step; j++) {
                const val = channelData[Math.floor(i * samples) + j];
                if (Math.abs(val) > max) max = Math.abs(val);
            }
            downsampledData.push(max);
        }

        const x = d3.scaleLinear().domain([0, downsampledData.length]).range([0, totalWidth]);
        
        const area = d3.area()
            .x((d: any, i: number) => x(i))
            .y0(height / 2)
            .y1((d: any) => height/2 + (d * height/2));

        const areaNegative = d3.area()
            .x((d: any, i: number) => x(i))
            .y0(height / 2)
            .y1((d: any) => height/2 - (d * height/2));
            
        layer.append('path')
            .datum(downsampledData)
            .attr('d', area)
            .attr('fill', 'url(#waveform-gradient)');

        layer.append('path')
            .datum(downsampledData)
            .attr('d', areaNegative)
            .attr('fill', 'url(#waveform-gradient)');
        
    }, [audioBuffer, containerWidth, zoom]); // Only redraw waveform if buffer/zoom changes

    // 2. Draw Slices Overlay (Medium Computation)
    useEffect(() => {
        if (!audioBuffer || !svgRef.current || containerWidth === 0) return;
        const svg = d3.select(svgRef.current);
        const layer = svg.select("#slices-layer");
        layer.selectAll("*").remove();

        const totalWidth = containerWidth * zoom;
        const height = 192; // Match h-48
        const duration = audioBuffer.duration;
        
        if (slices.length > 0) {
            slices.forEach((slice, index) => {
                const xPos = (slice.offset / duration) * totalWidth;
                const w = (slice.duration / duration) * totalWidth;
                
                // Group for slice
                const g = layer.append('g')
                    .attr('class', 'slice-group')
                    .attr('cursor', 'pointer');

                // Background for selection/hover detection
                let fill = 'transparent';
                if (!slice.isActive) {
                     fill = 'url(#disabled-pattern)';
                } else if (index === selectedSliceIndex) {
                     fill = 'rgba(255, 255, 255, 0.15)';
                }
                
                // Overlay for disabled state to darken it
                if (!slice.isActive) {
                     g.append('rect')
                        .attr('x', xPos)
                        .attr('y', 0)
                        .attr('width', w)
                        .attr('height', height)
                        .attr('fill', 'rgba(0,0,0,0.5)');
                }

                g.append('rect')
                    .attr('x', xPos)
                    .attr('y', 0)
                    .attr('width', w)
                    .attr('height', height)
                    .attr('fill', fill)
                    .attr('stroke', index === selectedSliceIndex ? '#ffffff' : (slice.isActive ? 'rgba(255,255,255,0.2)' : '#ff00aa'))
                    .attr('stroke-width', index === selectedSliceIndex ? 2 : 1)
                    .attr('stroke-dasharray', index === selectedSliceIndex ? 'none' : '4,2');
                
                // Red X for inactive
                if (!slice.isActive) {
                     g.append('line')
                        .attr('x1', xPos)
                        .attr('y1', 0)
                        .attr('x2', xPos + w)
                        .attr('y2', height)
                        .attr('stroke', '#ff00aa')
                        .attr('stroke-width', 1)
                        .attr('pointer-events', 'none');
                     
                     g.append('line')
                        .attr('x1', xPos)
                        .attr('y1', height)
                        .attr('x2', xPos + w)
                        .attr('y2', 0)
                        .attr('stroke', '#ff00aa')
                        .attr('stroke-width', 1)
                        .attr('pointer-events', 'none');
                }

                // Click to select
                g.on('click', (e: Event) => {
                    e.stopPropagation(); 
                    onSliceSelect(index);
                });
                
                // Double click to toggle active state
                g.on('dblclick', (e: Event) => {
                    e.stopPropagation();
                    onSliceToggle(index);
                });

                // Slice ID and Type Label
                if (w > 15) {
                    // ID
                    g.append('text')
                        .attr('x', xPos + 4)
                        .attr('y', 15)
                        .attr('fill', !slice.isActive ? '#ff00aa' : (index === selectedSliceIndex ? '#fff' : 'rgba(255,255,255,0.5)'))
                        .attr('font-size', '10px')
                        .attr('font-weight', 'bold')
                        .text(slice.id)
                        .style('text-decoration', !slice.isActive ? 'line-through' : 'none');
                    
                    // Type (K, S, H, P)
                    let typeLabel = 'P';
                    let typeColor = '#ffffff';
                    if (slice.type === 'kick') { typeLabel = 'K'; typeColor = '#ef4444'; }
                    else if (slice.type === 'snare') { typeLabel = 'S'; typeColor = '#eab308'; }
                    else if (slice.type === 'hihat') { typeLabel = 'H'; typeColor = '#00f6ff'; }
                    
                    if (w > 25 && slice.isActive) {
                        g.append('text')
                            .attr('x', xPos + 4)
                            .attr('y', height - 8)
                            .attr('fill', typeColor)
                            .attr('font-size', '9px')
                            .attr('font-weight', 'bold')
                            .text(typeLabel);
                    }
                }
            });
        }
    }, [slices, selectedSliceIndex, containerWidth, zoom, audioBuffer, onSliceSelect, onSliceToggle]);

    // 3. Draw Playback Highlight (Fast Update)
    useEffect(() => {
        if (!audioBuffer || !svgRef.current || containerWidth === 0) return;
        const svg = d3.select(svgRef.current);
        const layer = svg.select("#playback-layer");
        layer.selectAll("*").remove();

        const totalWidth = containerWidth * zoom;
        const height = 192; // Match h-48
        const duration = audioBuffer.duration;

        if (sequencer.isPlaying && sequencer.currentStep !== -1) {
            const currentStepData = sequencer.steps[sequencer.currentStep];
            if (currentStepData && currentStepData.active) {
                const activeSlice = slices[currentStepData.sliceIndex % slices.length];
                if (activeSlice) {
                    const startX = (activeSlice.offset / duration) * totalWidth;
                    const endX = ((activeSlice.offset + activeSlice.duration) / duration) * totalWidth;
                    const width = Math.max(1, endX - startX);
                    
                    // Highlight Rect
                    layer.append('rect')
                        .attr('x', startX)
                        .attr('y', 0)
                        .attr('width', width)
                        .attr('height', height)
                        .attr('fill', 'rgba(0, 246, 255, 0.3)') // Cyan highlight
                        .attr('stroke', '#00f6ff')
                        .attr('stroke-width', 2)
                        .attr('pointer-events', 'none');
                }
            }
        }
    }, [sequencer.currentStep, sequencer.isPlaying, slices, audioBuffer, containerWidth, zoom, sequencer.steps]);

    // 4. Draw Selection Overlay
    useEffect(() => {
        if (!svgRef.current) return;
        const svg = d3.select(svgRef.current);
        const layer = svg.select("#selection-layer");
        layer.selectAll("*").remove();
        
        if (dragStart !== null && dragCurrent !== null) {
            const start = Math.min(dragStart, dragCurrent);
            const width = Math.abs(dragCurrent - dragStart);
            
            if (width > 0) {
                layer.append("rect")
                    .attr("x", start)
                    .attr("y", 0)
                    .attr("width", width)
                    .attr("height", 192) // Match h-48
                    .attr("fill", "rgba(255, 255, 255, 0.2)")
                    .attr("stroke", "white")
                    .attr("stroke-width", 1)
                    .attr("stroke-dasharray", "4,2");
            }
        }
    }, [dragStart, dragCurrent]);


    return (
        <div className="space-y-1">
            {/* Scrollable Container */}
            <div 
                ref={containerRef} 
                className="w-full h-48 bg-deep-space/50 rounded-lg ring-1 ring-white/10 overflow-x-auto overflow-y-hidden relative scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent cursor-crosshair"
            >
                {!audioBuffer && (
                    <div className="w-full h-full flex items-center justify-center text-star-dust/50 absolute top-0 left-0">
                        <p>Load a sample to see waveform</p>
                    </div>
                )}
                <svg 
                    ref={svgRef} 
                    width={containerWidth * zoom} 
                    height="100%" 
                    style={{ minWidth: '100%' }}
                    onMouseDown={handleMouseDown}
                />
            </div>
             
             {/* Controls Bar Below Waveform */}
             <div className="flex justify-between items-center text-[10px] text-star-dust/50 px-1">
                 <div className="flex gap-4">
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>Kick</span>
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-yellow-500"></span>Snare</span>
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>Hat</span>
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-white"></span>Perc</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="uppercase tracking-widest">Zoom</span>
                    <button onClick={() => setZoom(Math.max(1, zoom - 0.5))} className="w-5 h-5 flex items-center justify-center bg-white/10 rounded hover:bg-white/20">-</button>
                    <span className="w-8 text-center">{Math.round(zoom * 100)}%</span>
                    <button onClick={() => setZoom(Math.min(10, zoom + 0.5))} className="w-5 h-5 flex items-center justify-center bg-white/10 rounded hover:bg-white/20">+</button>
                </div>
            </div>
        </div>
    );
};

export default WaveformDisplay;