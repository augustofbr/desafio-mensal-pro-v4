
import * as React from "react";
import { Pie, PieChart as RechartsPieChart, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

interface PieChartProps {
  data: any;
  options?: any;
}

export function PieChart({ data, options }: PieChartProps) {
  const chartData = React.useMemo(() => {
    return data.labels?.map((label: string, i: number) => ({
      name: label,
      value: data.datasets[0].data[i],
      fill: data.datasets[0].backgroundColor?.[i] || `rgba(${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)}, 0.7)`,
    }));
  }, [data]);

  const config = React.useMemo(() => {
    // Create config for each label
    return data.labels?.reduce(
      (acc: Record<string, any>, label: string, i: number) => {
        return {
          ...acc,
          [label]: { 
            color: data.datasets[0].backgroundColor?.[i] || `rgba(${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)}, 0.7)` 
          },
        };
      },
      {}
    );
  }, [data]);

  return (
    <ChartContainer config={config || {}}>
      <RechartsPieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          labelLine={true}
          label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
          outerRadius={80}
          fill="#8884d8"
          dataKey="value"
        >
          {chartData?.map((entry: any, index: number) => (
            <Cell key={`cell-${index}`} fill={entry.fill} />
          ))}
        </Pie>
        <ChartTooltip
          content={<ChartTooltipContent />}
        />
        <Legend 
          verticalAlign={options?.plugins?.legend?.position === "bottom" ? "bottom" : "top"} 
        />
      </RechartsPieChart>
    </ChartContainer>
  );
}
