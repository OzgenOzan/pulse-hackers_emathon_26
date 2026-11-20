from decimal import ROUND_HALF_UP, Decimal, localcontext


def format_rule_value(value: float, digits: int) -> str:
    # Match JavaScript toFixed() for the exact binary value; never round a score input.
    with localcontext() as context:
        context.rounding = ROUND_HALF_UP
        return format(Decimal(value), f'.{digits}f')


def format_cutoff(value: float, min_digits: int) -> str:
    # Configured cutoffs keep their shortest exact decimal, with at least `min_digits` places.
    whole, _, fraction = format(Decimal(repr(value)), 'f').partition('.')
    fraction = fraction.rstrip('0').ljust(min_digits, '0')
    return f'{whole}.{fraction}' if fraction else whole
