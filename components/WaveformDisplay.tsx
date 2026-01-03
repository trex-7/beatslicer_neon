
import React, { useRef, useEffect, useState } from 'react';
import type { Slice, SequencerState, SliceType } from '../types';
import InfoIcon from './InfoIcon';

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
    onPlaySlice: (index: number) => void;
    onSliceTypeChange: (index: number, type: SliceType) => void;
    onPreviewToggle: () => void;
    isPreviewing: boolean;
    isProMode: boolean;
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
    onRegionSlice,
    onPlaySlice,
    onSliceTypeChange,
    onPreviewToggle,
    isPreviewing,
    isProMode
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const [zoom, setZoom] = useState(1);
    const [containerWidth, setContainerWidth] = useState(0);

    // Track playback state for click handlers without forcing D3 redraws
    const isPlayingRef = useRef(isPlaying);
    useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

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

    // Drag Logic - DISABLED IN SIMPLE MODE (Prevents accidental slicing)
    useEffect(() => {
        if (!isProMode) return; 

        const handleWindowMouseMove = (e: MouseEvent) => {
            if (dragStart !== null && svgRef.current) {
                 const rect = svgRef.current.getBoundingClientRect();
                 let x = e.clientX - rect.left;
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
    }, [dragStart, audioBuffer, onRegionSlice, isProMode]);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!audioBuffer || !isProMode) return; // Only allow custom slicing in Pro Mode
        const rect = svgRef.current!.getBoundingClientRect();
        const x = e.clientX - rect.left;
        setDragStart(x);
        setDragCurrent(x);
    };

    // Initialize Layers (Run once)
    useEffect(() => {
        if (!svgRef.current) return;
        const svg = d3.select(svgRef.current);
        
        if (svg.select("#defs-layer").empty()) {
            const defs = svg.append("defs").attr("id", "defs-layer");
            
            defs.append("pattern")
                .attr("id", "disabled-pattern")
                .attr("patternUnits", "userSpaceOnUse")
                .attr("width", 10)
                .attr("height", 10)
                .append("path")
                .attr("d", "M-1,1 l2,-2 M0,10 l10,-10 M9,11 l2,-2")
                .attr("stroke", "#444")
                .attr("stroke-width", 1);
            
            // Cyberpunk Gradient
            const grad = defs.append("linearGradient")
                .attr("id", "waveform-gradient")
                .attr("x1", "0%")
                .attr("y1", "0%")
                .attr("x2", "0%")
                .attr("y2", "100%");
            grad.append("stop").attr("offset", "0%").attr("stop-color", "#00f6ff").attr("stop-opacity", 0.9);
            grad.append("stop").attr("offset", "50%").attr("stop-color", "#00f6ff").attr("stop-opacity", 0.5);
            grad.append("stop").attr("offset", "100%").attr("stop-color", "#ff00aa").attr("stop-opacity", 0.2);

            svg.append("g").attr("id", "slices-layer");
            svg.append("g").attr("id", "waveform-layer");
            svg.append("g").attr("id", "playback-layer");
            svg.append("g").attr("id", "selection-layer"); 
        }
    }, []);

    // 1. Draw Waveform
    useEffect(() => {
        if (!audioBuffer || !svgRef.current || containerWidth === 0) return;

        const svg = d3.select(svgRef.current);
        const layer = svg.select("#waveform-layer");
        layer.selectAll("*").remove();

        const totalWidth = containerWidth * zoom;
        const height = 192; 

        const channelData = audioBuffer.getChannelData(0);
        const samples = Math.floor(channelData.length / totalWidth);
        
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
            
        // Top Half with Gradient
        layer.append('path')
            .datum(downsampledData)
            .attr('d', area)
            .attr('fill', 'url(#waveform-gradient)')
            .attr('opacity', 0.8);

        // Mirror Reflection (fainter)
        layer.append('path')
            .datum(downsampledData)
            .attr('d', areaNegative)
            .attr('fill', 'url(#waveform-gradient)')
            .attr('opacity', 0.3);
            
        // Center Line
        layer.append('line')
            .attr('x1', 0)
            .attr('x2', totalWidth)
            .attr('y1', height/2)
            .attr('y2', height/2)
            .attr('stroke', 'rgba(255,255,255,0.1)')
            .attr('stroke-width', 1);

    }, [audioBuffer, containerWidth, zoom]); 

    // 2. Draw Slices Overlay
    useEffect(() => {
        if (!audioBuffer || !svgRef.current || containerWidth === 0) return;
        const svg = d3.select(svgRef.current);
        const layer = svg.select("#slices-layer");
        layer.selectAll("*").remove();

        const totalWidth = containerWidth * zoom;
        const height = 192; 
        const duration = audioBuffer.duration;
        
        const getTypeColor = (type: SliceType) => {
            switch (type) {
                case 'kick': return '#ef4444'; 
                case 'snare': return '#eab308'; 
                case 'hihat': return '#00f6ff'; 
                case 'perc': return '#a855f7'; 
                default: return '#ffffff';
            }
        };

        if (slices.length > 0) {
            slices.forEach((slice, index) => {
                const xPos = (slice.offset / duration) * totalWidth;
                const w = (slice.duration / duration) * totalWidth;
                const color = getTypeColor(slice.type);
                const isSelected = index === selectedSliceIndex;
                
                const g = layer.append('g')
                    .attr('class', 'slice-group')
                    .attr('cursor', 'pointer');

                // Fill logic
                let fill = 'transparent';
                if (!slice.isActive) {
                     fill = 'url(#disabled-pattern)';
                } else if (isSelected) {
                     fill = color + '33'; // Low opacity fill for selected
                }
                
                // Muted Overlay
                if (!slice.isActive) {
                     g.append('rect')
                        .attr('x', xPos)
                        .attr('y', 0)
                        .attr('width', w)
                        .attr('height', height)
                        .attr('fill', 'rgba(0,0,0,0.6)');
                }

                // Slice Box
                g.append('rect')
                    .attr('x', xPos)
                    .attr('y', 0)
                    .attr('width', w)
                    .attr('height', height)
                    .attr('fill', fill)
                    .attr('stroke', isSelected ? '#ffffff' : color)
                    .attr('stroke-width', isSelected ? 2 : 1)
                    .attr('stroke-opacity', isSelected ? 1 : 0.3);
                
                g.on('click', (e: Event) => {
                    e.stopPropagation(); 
                    onSliceSelect(index);
                    if (!isPlayingRef.current) {
                        onPlaySlice(index);
                    }
                });
                
                g.on('dblclick', (e: Event) => {
                    e.stopPropagation();
                    if (isProMode) {
                        onSliceToggle(index); 
                    }
                });

                if (w > 15) {
                    // ID Label
                    g.append('text')
                        .attr('x', xPos + 4)
                        .attr('y', 15)
                        .attr('fill', !slice.isActive ? '#999' : (isSelected ? '#fff' : 'rgba(255,255,255,0.7)'))
                        .attr('font-size', '10px')
                        .attr('font-weight', 'bold')
                        .text(slice.id);
                    
                    // Type Label (Bottom)
                    let typeLabel = '';
                    if (slice.type === 'kick') typeLabel = 'K';
                    else if (slice.type === 'snare') typeLabel = 'S';
                    else if (slice.type === 'hihat') typeLabel = 'H';
                    else if (slice.type === 'perc') typeLabel = 'P';
                    
                    if (w > 20 && slice.isActive) {
                        g.append('rect')
                            .attr('x', xPos + 2)
                            .attr('y', height - 14)
                            .attr('width', 12)
                            .attr('height', 12)
                            .attr('rx', 2)
                            .attr('fill', color)
                            .attr('opacity', 0.8);

                        g.append('text')
                            .attr('x', xPos + 8)
                            .attr('y', height - 5)
                            .attr('text-anchor', 'middle')
                            .attr('fill', '#000')
                            .attr('font-size', '10px')
                            .attr('font-weight', 'bold')
                            .text(typeLabel);
                    }
                }
            });
        }
    }, [slices, selectedSliceIndex, containerWidth, zoom, audioBuffer, onSliceSelect, onSliceToggle, onPlaySlice, isProMode]);

    // 3. Draw Playback Highlight
    useEffect(() => {
        if (!audioBuffer || !svgRef.current || containerWidth === 0) return;
        const svg = d3.select(svgRef.current);
        const layer = svg.select("#playback-layer");
        layer.selectAll("*").remove();

        const totalWidth = containerWidth * zoom;
        const height = 192; 
        const duration = audioBuffer.duration;

        if (sequencer.isPlaying && sequencer.currentStep !== -1) {
            const currentStepData = sequencer.steps[sequencer.currentStep];
            if (currentStepData && currentStepData.active) {
                const activeSlice = slices[currentStepData.sliceIndex % slices.length];
                if (activeSlice) {
                    const startX = (activeSlice.offset / duration) * totalWidth;
                    const endX = ((activeSlice.offset + activeSlice.duration) / duration) * totalWidth;
                    const width = Math.max(1, endX - startX);
                    
                    layer.append('rect')
                        .attr('x', startX)
                        .attr('y', 0)
                        .attr('width', width)
                        .attr('height', height)
                        .attr('fill', 'white')
                        .attr('fill-opacity', 0.1)
                        .attr('stroke', '#ffffff')
                        .attr('stroke-width', 2)
                        .style('mix-blend-mode', 'overlay')
                        .attr('pointer-events', 'none');
                        
                    // Add a glowing line at start
                    layer.append('line')
                         .attr('x1', startX)
                         .attr('x2', startX)
                         .attr('y1', 0)
                         .attr('y2', height)
                         .attr('stroke', '#00f6ff')
                         .attr('stroke-width', 2)
                         .style('filter', 'drop-shadow(0 0 5px #00f6ff)');
                }
            }
        }
    }, [sequencer.currentStep, sequencer.isPlaying, slices, audioBuffer, containerWidth, zoom, sequencer.steps]);

    // 4. Draw Selection Overlay (PRO MODE ONLY)
    useEffect(() => {
        if (!svgRef.current) return;
        const svg = d3.select(svgRef.current);
        const layer = svg.select("#selection-layer");
        layer.selectAll("*").remove();
        
        if (dragStart !== null && dragCurrent !== null && isProMode) {
            const start = Math.min(dragStart, dragCurrent);
            const width = Math.abs(dragCurrent - dragStart);
            
            if (width > 0) {
                layer.append("rect")
                    .attr("x", start)
                    .attr("y", 0)
                    .attr("width", width)
                    .attr("height", 192) 
                    .attr("fill", "rgba(255, 255, 255, 0.1)")
                    .attr("stroke", "white")
                    .attr("stroke-width", 1)
                    .attr("stroke-dasharray", "4,2");
            }
        }
    }, [dragStart, dragCurrent, isProMode]);


    const currentSliceType = selectedSliceIndex !== null && slices[selectedSliceIndex] ? slices[selectedSliceIndex].type : null;

    const ClassificationButton = ({ type, color, label }: { type: SliceType, color: string, label: string }) => {
        const isActive = currentSliceType === type;
        
        let colorClasses = "";
        let borderClass = "";
        
        if (type === 'kick') { colorClasses = "text-red-500 bg-red-500/10 hover:bg-red-500/20"; borderClass = "border-red-500"; }
        else if (type === 'snare') { colorClasses = "text-yellow-500 bg-yellow-500/10 hover:bg-yellow-500/20"; borderClass = "border-yellow-500"; }
        else if (type === 'hihat') { colorClasses = "text-cyan-400 bg-cyan-400/10 hover:bg-cyan-400/20"; borderClass = "border-cyan-400"; }
        else { colorClasses = "text-purple-400 bg-purple-400/10 hover:bg-purple-400/20"; borderClass = "border-purple-400"; }

        const activeClasses = isActive 
            ? `bg-opacity-100 ${colorClasses.replace('/10', '/30')} border ${borderClass} shadow-[0_0_10px_rgba(255,255,255,0.2)]` 
            : `border border-white/10 opacity-70 hover:opacity-100 hover:border-white/30`;

        return (
            <button 
                onClick={() => selectedSliceIndex !== null && onSliceTypeChange(selectedSliceIndex, type)}
                className={`flex-1 flex flex-row items-center justify-center gap-2 py-1.5 px-2 rounded-md transition-all duration-200 group ${activeClasses}`}
                title={`Set Selected Slice to ${label}`}
                disabled={selectedSliceIndex === null}
            >
                <div className={`w-2 h-2 rounded-full transition-transform group-hover:scale-125 ${isActive ? 'bg-white' : ''}`} style={{ backgroundColor: isActive ? '#fff' : color }}></div>
                <span className={`text-[10px] font-bold uppercase tracking-wider ${isActive ? 'text-white' : 'text-star-dust'}`}>{label}</span>
            </button>
        );
    }

    return (
        <div className="space-y-2">
            {/* Scrollable Container */}
            <div 
                ref={containerRef} 
                className={`w-full h-48 bg-[#0a0d14] rounded-xl border border-white/10 overflow-x-auto overflow-y-hidden relative scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent ${isProMode ? 'cursor-crosshair' : 'cursor-pointer'} shadow-inner`}
            >
                {!audioBuffer && (
                    <div className="w-full h-full flex items-center justify-center text-star-dust/50 absolute top-0 left-0">
                        <div className="flex flex-col items-center gap-2">
                            <span className="text-2xl opacity-50">🌊</span>
                            <p className="text-xs font-bold uppercase tracking-wider">Load sample to view waveform</p>
                        </div>
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
             
             {/* Controls Bar - HIDDEN IN SIMPLE MODE to reduce clutter */}
             {isProMode && (
                 <div className="flex flex-col sm:flex-row justify-between items-center gap-2 p-1.5 bg-deep-space/30 rounded-lg border border-white/5 animate-in slide-in-from-top-2 duration-300">
                     
                     <div className="flex items-center gap-2">
                        <button
                            onClick={onPreviewToggle}
                            className={`px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider border transition-all ${
                                isPreviewing 
                                ? 'bg-plasma-pink text-white border-plasma-pink animate-pulse' 
                                : 'bg-transparent text-plasma-pink border-plasma-pink/50 hover:bg-plasma-pink/10'
                            }`}
                        >
                            {isPreviewing ? 'Stop Preview' : 'Preview Original'}
                        </button>
                        <InfoIcon text="Click & Drag on waveform to re-slice (Pro Mode). Double-click a slice to mute/unmute." />
                     </div>

                     {/* Classification Buttons */}
                     <div className="flex gap-1 w-full sm:w-2/3">
                        <ClassificationButton type="kick" color="#ef4444" label="Kick" />
                        <ClassificationButton type="snare" color="#eab308" label="Snare" />
                        <ClassificationButton type="hihat" color="#00f6ff" label="Hat" />
                        <ClassificationButton type="perc" color="#a855f7" label="Perc" />
                    </div>

                    {/* Zoom Controls */}
                    <div className="flex items-center gap-1 bg-black/20 px-2 py-1 rounded-md border border-white/5 h-8">
                        <span className="uppercase text-[10px] font-bold text-star-dust/50 tracking-widest hidden sm:inline mr-2">Zoom</span>
                        <button onClick={() => setZoom(Math.max(1, zoom - 0.5))} className="w-6 h-full flex items-center justify-center bg-white/5 rounded hover:bg-white/20 text-white font-mono text-sm">-</button>
                        <span className="w-10 text-center text-xs font-mono text-hyper-cyan">{Math.round(zoom * 100)}%</span>
                        <button onClick={() => setZoom(Math.min(10, zoom + 0.5))} className="w-6 h-full flex items-center justify-center bg-white/5 rounded hover:bg-white/20 text-white font-mono text-sm">+</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WaveformDisplay;
