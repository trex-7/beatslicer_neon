
import React, { useRef, useEffect, useState } from 'react';
import type { Slice, SequencerState } from '../types';

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
}

const WaveformDisplay: React.FC<WaveformDisplayProps> = ({ 
    audioBuffer, 
    onScrub, 
    isPlaying, 
    playerRef, 
    slices, 
    sequencer, 
    selectedSliceIndex,
    onSliceSelect 
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const [zoom, setZoom] = useState(1);
    const [containerWidth, setContainerWidth] = useState(0);

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

            // Layer order determines z-index
            svg.append("g").attr("id", "waveform-layer");
            svg.append("g").attr("id", "slices-layer");
            svg.append("g").attr("id", "playback-layer");
        }
    }, []);

    // 1. Draw Waveform (Heavy Computation)
    useEffect(() => {
        if (!audioBuffer || !svgRef.current || containerWidth === 0) return;

        const svg = d3.select(svgRef.current);
        const layer = svg.select("#waveform-layer");
        layer.selectAll("*").remove();

        const totalWidth = containerWidth * zoom;
        const height = 128; // Fixed height matching Tailwind h-32

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
        const height = 128;
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
                g.append('rect')
                    .attr('x', xPos)
                    .attr('y', 0)
                    .attr('width', w)
                    .attr('height', height)
                    .attr('fill', index === selectedSliceIndex ? 'rgba(255, 255, 255, 0.15)' : 'transparent')
                    .attr('stroke', index === selectedSliceIndex ? '#ffffff' : 'rgba(255,255,255,0.2)')
                    .attr('stroke-width', index === selectedSliceIndex ? 2 : 1)
                    .attr('stroke-dasharray', index === selectedSliceIndex ? 'none' : '4,2');

                // Click to select
                g.on('click', (e: Event) => {
                    e.stopPropagation();
                    onSliceSelect(index);
                });

                // Slice ID Label
                if (w > 20) { 
                    g.append('text')
                        .attr('x', xPos + 4)
                        .attr('y', 15)
                        .attr('fill', index === selectedSliceIndex ? '#fff' : 'rgba(255,255,255,0.5)')
                        .attr('font-size', '10px')
                        .attr('font-weight', 'bold')
                        .text(slice.id);
                }
            });
        }
    }, [slices, selectedSliceIndex, containerWidth, zoom, audioBuffer, onSliceSelect]);

    // 3. Draw Playback Highlight (Fast Update)
    useEffect(() => {
        if (!audioBuffer || !svgRef.current || containerWidth === 0) return;
        const svg = d3.select(svgRef.current);
        const layer = svg.select("#playback-layer");
        layer.selectAll("*").remove();

        const totalWidth = containerWidth * zoom;
        const height = 128;
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


    return (
        <div className="space-y-2">
            {/* Zoom Controls */}
            <div className="flex justify-between items-center text-xs text-star-dust/70 uppercase tracking-widest">
                <span>Waveform</span>
                <div className="flex items-center gap-2">
                    <span>Zoom</span>
                    <button onClick={() => setZoom(Math.max(1, zoom - 0.5))} className="px-2 py-0.5 bg-white/10 rounded hover:bg-white/20">-</button>
                    <span className="w-8 text-center">{Math.round(zoom * 100)}%</span>
                    <button onClick={() => setZoom(Math.min(10, zoom + 0.5))} className="px-2 py-0.5 bg-white/10 rounded hover:bg-white/20">+</button>
                </div>
            </div>

            {/* Scrollable Container */}
            <div 
                ref={containerRef} 
                className="w-full h-32 bg-deep-space/50 rounded-lg ring-1 ring-white/10 overflow-x-auto overflow-y-hidden relative scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent"
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
                />
            </div>
             <div className="text-[10px] text-center text-star-dust/40 mt-1">
                Click a slice to select it (White). Assign selected slice to Sequencer pads below.
            </div>
        </div>
    );
};

export default WaveformDisplay;
