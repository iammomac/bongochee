from rest_framework import serializers


class RevenueTrendPointSerializer(serializers.Serializer):
    date = serializers.DateField()
    revenue = serializers.DecimalField(max_digits=12, decimal_places=2)
    profit = serializers.DecimalField(max_digits=12, decimal_places=2)


class DashboardSummarySerializer(serializers.Serializer):
    todays_sales = serializers.DecimalField(max_digits=12, decimal_places=2)
    todays_profit = serializers.DecimalField(max_digits=12, decimal_places=2)
    todays_returns = serializers.IntegerField()
    remaining_stock = serializers.IntegerField()
    total_stock_value = serializers.DecimalField(max_digits=12, decimal_places=2)
    low_stock = serializers.IntegerField()
    out_of_stock = serializers.IntegerField()
    pending_returns = serializers.IntegerField()
    pending_password_requests = serializers.IntegerField()
    revenue_trend = RevenueTrendPointSerializer(many=True)
