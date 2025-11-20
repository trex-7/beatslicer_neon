
import React from 'react';

interface SliderProps {
    label: string;
    min: number;
    max: number;
    step: number;
    value: number;
    onChange: (value: number) => void;
    disabled?: boolean;
    unit?: string;
    log?: boolean;
}

const Slider: React.FC<SliderProps> = ({ label, min, max, step, value, onChange, disabled, unit, log }) => {
    
    const getLogValue = (position: number) => {
        const minLog = Math.log(min);
        const maxLog = Math.log(max);
        const scale = (maxLog - minLog) / 100;
        return Math.exp(minLog + scale * position);
    }
    
    const getLogPosition = (val: number) => {
        const minLog = Math.log(min);
        const maxLog = Math.log(max);
        const scale = (maxLog - minLog) / 100;
        return (Math.log(val) - minLog) / scale;
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const position = parseFloat(e.target.value);
        const newValue = log ? getLogValue(position) : position;
        onChange(newValue);
    };

    const displayValue = value.toFixed(2);
    const sliderPosition = log ? getLogPosition(value) : value;

    return (
        <div className="w-full">
            <div className="flex justify-between items-center mb-1">
                <label className="text-sm font-medium text-star-dust/80">{label}</label>
                <span className="text-sm font-mono text-hyper-cyan bg-deep-space/50 px-2 py-0.5 rounded">
                    {displayValue}{unit && ` ${unit}`}
                </span>
            </div>
            <input
                type="range"
                min={log ? 0 : min}
                max={log ? 100 : max}
                step={log ? 0.1 : step}
                value={sliderPosition}
                onChange={handleChange}
                disabled={disabled}
                className="w-full h-2 bg-nebula-blue rounded-lg appearance-none cursor-pointer 
                           disabled:cursor-not-allowed disabled:opacity-50
                           [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 
                           [&::-webkit-slider-thumb]:bg-hyper-cyan [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-md
                           [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:duration-150 [&::-webkit-slider-thumb]:ease-in-out
                           hover:[&::-webkit-slider-thumb]:scale-110
                           focus:[&::-webkit-slider-thumb]:ring-2 focus:[&::-webkit-slider-thumb]:ring-plasma-pink
                           "
            />
        </div>
    );
};

export default Slider;
