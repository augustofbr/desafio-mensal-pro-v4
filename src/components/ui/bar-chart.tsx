
import * as React from "react";
import { Bar, BarChart as RechartsBarChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

interface BarChartProps {
  data: any;
  options?: any;
}

export function BarChart({ data, options }: BarChartProps) {
  const config = React.useMemo(() => {
    const colors = [
      { color: "#2563eb" }, // blue-600
      { color: "#db2777" }, // pink-600
      { color: "#16a34a" }, // green-600
      { color: "#ea580c" }, // orange-600
      { color: "#9333ea" }, // purple-600
      { color: "#e11d48" }, // rose-600
      { color: "#0891b2" }, // cyan-600
      { color: "#854d0e" }, // amber-600
    ];

    // Create config for each dataset
    return data.datasets?.reduce(
      (acc: Record<string, any>, dataset: any, i: number) => {
        const id = dataset.label || `dataset-${i}`;
        return {
          ...acc,
          [id]: colors[i % colors.length],
        };
      },
      {}
    );
  }, [data]);

  return (
    <ChartContainer config={config || {}}>
      <RechartsBarChart data={data?.labels?.map((label: string, i: number) => ({
        name: label,
        ...data.datasets?.reduce((acc: Record<string, any>, dataset: any, datasetIndex: number) => {
          const id = dataset.label || `dataset-${datasetIndex}`;
          return {
            ...acc,
            [id]: dataset.data[i],
          };
        }, {}),
      }))}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis 
          dataKey="name" 
          {...(options?.scales?.x || {})}
        />
        <YAxis 
          {...(options?.scales?.y || {})}
        />
        <ChartTooltip
          content={<ChartTooltipContent />}
        />
        <Legend 
          verticalAlign={options?.plugins?.legend?.position === "bottom" ? "bottom" : "top"} 
        />
        {data.datasets?.map((dataset: any, i: number) => (
          <Bar
            key={`bar-${i}`}
            dataKey={dataset.label || `dataset-${i}`}
            fill={dataset.backgroundColor || config[dataset.label || `dataset-${i}`]?.color}
          />
        ))}
      </RechartsBarChart>
    </ChartContainer>
  );
}
