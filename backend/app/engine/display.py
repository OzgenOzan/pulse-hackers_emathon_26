from decimal import ROUND_HALF_UP, Decimal, localcontext


def format_rule_value(value: float, digits: int) -> str:
    # Match JavaScript toFixed() for the exact binary value; never round a score input.
    with localcontext() as context:
        context.rounding = ROUND_HALF_UP
        return format(Decimal(value), f'.{digits}f')
