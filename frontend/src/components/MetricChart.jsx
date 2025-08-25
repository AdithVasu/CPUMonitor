import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import io from 'socket.io-client';
import './MetricChart.css';

const socket = io('http://localhost:3001');

const MetricChart = ({ metric, title }) => {
  const chartRef = useRef(null);
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    console.log(`MetricChart: Requesting data for metric: ${metric}`);
    
    // Request historical data
    socket.emit('request_historical_data', { metric, timeRange: '1h' });
    
    // Handle real-time data updates
    const handleCpuData = (newData) => {
      console.log(`MetricChart: Received real-time data for ${metric}:`, newData);
      
      // Handle the new metric structure with better error checking
      let value = null;
      
      try {
        // Direct property access (for basic metrics like cpu_usage, memory_usage, etc.)
        if (newData.hasOwnProperty(metric) && newData[metric] !== null && newData[metric] !== undefined) {
          value = newData[metric];
        }
        // Handle nested metrics (if needed in the future)
        else if (metric.includes('.')) {
          const keys = metric.split('.');
          let obj = newData;
          for (const key of keys) {
            if (obj && obj.hasOwnProperty(key)) {
              obj = obj[key];
            } else {
              obj = null;
              break;
            }
          }
          value = obj;
        }
        
        console.log(`MetricChart: Extracted value for ${metric}:`, value);
        
        if (value !== null && value !== undefined && !isNaN(value)) {
          setData(prevData => {
            const newPoint = { 
              timestamp: new Date(newData.timestamp), 
              value: Number(value)
            };
            const updatedData = [...prevData, newPoint];
            // Keep only the last 100 points for performance
            return updatedData.slice(-100);
          });
          setError(null);
        }
      } catch (err) {
        console.error(`MetricChart: Error processing real-time data for ${metric}:`, err);
        setError(`Error processing data: ${err.message}`);
      }
    };

    // Handle historical data response
    const handleHistoricalData = (historicalData) => {
      console.log(`MetricChart: Received historical data response:`, historicalData);
      
      if (historicalData.metric === metric) {
        try {
          if (historicalData.data && Array.isArray(historicalData.data)) {
            const formattedData = historicalData.data
              .filter(d => d.value !== null && d.value !== undefined && !isNaN(d.value))
              .map(d => ({
                timestamp: new Date(d.timestamp),
                value: Number(d.value)
              }))
              .sort((a, b) => a.timestamp - b.timestamp); // Ensure chronological order
            
            console.log(`MetricChart: Formatted ${formattedData.length} historical points for ${metric}`);
            setData(formattedData);
            setError(null);
          } else {
            console.warn(`MetricChart: No historical data available for ${metric}`);
            setData([]);
          }
        } catch (err) {
          console.error(`MetricChart: Error processing historical data for ${metric}:`, err);
          setError(`Error loading historical data: ${err.message}`);
        }
        setIsLoading(false);
      }
    };

    // Handle connection errors
    const handleError = (error) => {
      console.error(`MetricChart: Socket error for ${metric}:`, error);
      setError(`Connection error: ${error.message}`);
      setIsLoading(false);
    };

    // Set up event listeners
    socket.on('cpu_data', handleCpuData);
    socket.on('historical_data', handleHistoricalData);
    socket.on('error', handleError);
    socket.on('collection_error', handleError);

    // Cleanup function
    return () => {
      console.log(`MetricChart: Cleaning up listeners for ${metric}`);
      socket.off('cpu_data', handleCpuData);
      socket.off('historical_data', handleHistoricalData);
      socket.off('error', handleError);
      socket.off('collection_error', handleError);
    };
  }, [metric]);

  // D3 Chart rendering
  useEffect(() => {
    if (data.length === 0) {
      // Clear any existing chart
      d3.select(chartRef.current).select('svg').remove();
      return;
    }

    try {
      const container = chartRef.current;
      if (!container) return;

      const margin = { top: 20, right: 30, bottom: 40, left: 50 };
      const width = Math.max(300, container.clientWidth - margin.left - margin.right);
      const height = Math.max(200, container.clientHeight - margin.top - margin.bottom);

      // Clear previous chart
      d3.select(container).select('svg').remove();

      const svg = d3.select(container)
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

      // Set up scales
      const x = d3.scaleTime()
        .domain(d3.extent(data, d => d.timestamp))
        .range([0, width]);

      const yMax = d3.max(data, d => d.value) || 100;
      const y = d3.scaleLinear()
        .domain([0, yMax * 1.1])
        .range([height, 0]);

      // Add axes
      svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x)
          .ticks(Math.min(5, data.length))
          .tickFormat(d3.timeFormat('%H:%M'))
        );

      svg.append('g')
        .call(d3.axisLeft(y)
          .ticks(5)
        );

      // Add grid lines
      svg.append('g')
        .attr('class', 'grid')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x)
          .ticks(5)
          .tickSize(-height)
          .tickFormat('')
        )
        .style('stroke-dasharray', '3,3')
        .style('opacity', 0.3);

      svg.append('g')
        .attr('class', 'grid')
        .call(d3.axisLeft(y)
          .ticks(5)
          .tickSize(-width)
          .tickFormat('')
        )
        .style('stroke-dasharray', '3,3')
        .style('opacity', 0.3);

      // Create line generator
      const line = d3.line()
        .x(d => x(d.timestamp))
        .y(d => y(d.value))
        .curve(d3.curveMonotoneX); // Smooth curve

      // Add the line path
      svg.append('path')
        .datum(data)
        .attr('fill', 'none')
        .attr('stroke', 'var(--primary-color, #007bff)')
        .attr('stroke-width', 2)
        .attr('d', line);

      // Add dots for data points
      svg.selectAll('.dot')
        .data(data)
        .enter().append('circle')
        .attr('class', 'dot')
        .attr('cx', d => x(d.timestamp))
        .attr('cy', d => y(d.value))
        .attr('r', 3)
        .attr('fill', 'var(--primary-color, #007bff)');

      // Add tooltip functionality
      const tooltip = d3.select('body').selectAll('.tooltip')
        .data([0])
        .join('div')
        .attr('class', 'tooltip')
        .style('opacity', 0)
        .style('position', 'absolute')
        .style('background', 'rgba(0,0,0,0.8)')
        .style('color', 'white')
        .style('padding', '8px')
        .style('border-radius', '4px')
        .style('font-size', '12px')
        .style('pointer-events', 'none');

      svg.selectAll('.dot')
        .on('mouseover', function(event, d) {
          tooltip.transition()
            .duration(200)
            .style('opacity', .9);
          tooltip.html(`Time: ${d.timestamp.toLocaleTimeString()}<br/>Value: ${d.value.toFixed(2)}`)
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 28) + 'px');
        })
        .on('mouseout', function() {
          tooltip.transition()
            .duration(500)
            .style('opacity', 0);
        });

    } catch (err) {
      console.error(`MetricChart: Error rendering chart for ${metric}:`, err);
      setError(`Chart rendering error: ${err.message}`);
    }
  }, [data, metric]);

  // Render loading, error, or chart
  if (isLoading) {
    return (
      <div className="chart-container">
        <h3>{title}</h3>
        <div className="chart-loading">Loading chart data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="chart-container">
        <h3>{title}</h3>
        <div className="chart-error">
          <p>Error: {error}</p>
          <button onClick={() => {
            setError(null);
            setIsLoading(true);
            socket.emit('request_historical_data', { metric, timeRange: '1h' });
          }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="chart-container">
        <h3>{title}</h3>
        <div className="chart-no-data">No data available</div>
      </div>
    );
  }

  return (
    <div className="chart-container">
      <h3>{title}</h3>
      <div ref={chartRef} className="d3-chart"></div>
      <div className="chart-info">
        {data.length} data points | Latest: {data[data.length - 1]?.value?.toFixed(2)}
      </div>
    </div>
  );
};

export default MetricChart;